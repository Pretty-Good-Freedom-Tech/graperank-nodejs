import { Event as NostrEvent} from 'nostr-tools/core'
import { Filter as NostrFilter} from 'nostr-tools/filter'
import { SimplePool } from 'nostr-tools/pool'
import { useWebSocketImplementation } from 'nostr-tools/pool'
import { DEBUGTARGET, sliceBigArray} from "@graperank/util"
import { elemId, InterpretationProtocol, ProtocolParams, ProtocolRequest, Rating, RatingData, RatingsMap, userId } from "@graperank/util/types"
import WebSocket from 'ws'
import { npubEncode } from "nostr-tools/nip19"
useWebSocketImplementation(WebSocket)

const relays = [
  "wss://gv.rogue.earth",
  // "wss://purplepag.es",
  // "wss://relay.primal.net",
  // "wss://relay.damus.io",
  // "wss://nostr-pub.wellorder.net",
  // "wss://relay.nostr.bg",
  "wss://nostr.bitcoiner.social",
  // "wss://nostr.fmt.wiz.biz",
  // "wss://nostr.oxtr.dev",
  // "wss://nostr.mom",
  "wss://relay.nostr.band",
  "wss://relay.snort.social",
  // "wss://soloco.nl",
  "wss://nos.lol",
]

const maxauthors = 1000
const delaybetweenfetches = 500 // milliceconds

export type  NostrProtocolConfig<ParamsType extends ProtocolParams> = {
  kinds : number[],
  params : ParamsType,
  interpret? : 
    (instance : InterpretationProtocol<ParamsType>, dos : number) 
    => Promise<RatingsMap>,
  validate? : 
    (events : Set<NostrEvent>, authors : userId[], previous? : Set<NostrEvent>) 
    => boolean | userId[],
}

export class NostrProtocol<ParamsType extends ProtocolParams> implements InterpretationProtocol<ParamsType> {
  readonly kinds : number[]
  request : ProtocolRequest
  private _params : ParamsType
  get params(){ return {...this._params, ...this.request.params}}
  fetched : Set<NostrEvent>[] = []
  interpreted : RatingsMap = new Map()
  interpret : (dos? : number) => Promise<RatingsMap>
  validate? : 
  (events : Set<NostrEvent>, authors : userId[], previous? : Set<NostrEvent>) 
  => boolean | userId[]

  constructor(config: NostrProtocolConfig<ParamsType>){
    this.kinds = config.kinds
    this._params = config.params
    this.validate = config.validate
    this.interpret = async (dos? : number) => {
      if(!this.fetched.length) throw('GrapeRank : '+this.request.protocol+' protocol interpret() : ERROR : NO EVENTS FETCHED PRIOR TO INTERPRET')
      // use the set of fetched events at fetchedIndex or LAST index
      dos = dos || this.fetched.length
      let fetchedIndex = dos - 1
      let newratings : RatingsMap 
      console.log("GrapeRank : ",this.request.protocol," protocol : interptreting " ,this.fetched[fetchedIndex].size, " events fetched in iteration ", dos)
      // interpret newratings via defined callback or default
      if(config.interpret) {
        newratings = await config.interpret(this, dos) 
      }else{
        newratings = await applyRatingsByTag(this, dos)
      }

      // merge newratings into this.interpreted
      let numratingsmerged = 0
      let numraterratings = 0
      let numratingsduplicate = 0
      newratings.forEach((rateemap,rater)=>{ 
        let raterratings = this.interpreted.get(rater)
        if(raterratings) {
          numraterratings = raterratings.size
          rateemap.forEach((ratingdata,ratee)=>{
            raterratings.set(ratee, ratingdata)
          })
          numratingsmerged = numratingsmerged + (raterratings.size - numraterratings)
          numratingsduplicate = numratingsduplicate + (rateemap.size - (raterratings.size - numraterratings))
        }else{
          numratingsmerged = numratingsmerged + rateemap.size
          this.interpreted.set(rater, rateemap) 
        }
      })

      console.log("GrapeRank : ",this.request.protocol," protocol : merged iteration ",dos," into total interpreted : ", numratingsmerged ," new ratings and ",numratingsduplicate," duplicate ratings from ",newratings.size," authors")

      return newratings
    }
  }

  // breaks up a large raters list into multiple authors lists 
  // suitable for relay requests, and sends them all in parrallel
  // returns a single promise that is resolved when all fetches are complete.
  async fetchData(authors? : Set<userId>) : Promise<number> {
    authors = authors || new Set(this.request.authors)
    // authorslists is authors broken into an array of list, 
    // where each list is maximum size allowed for relay requests
    const authorslists : userId[][] = authors.size > maxauthors ? 
      await sliceBigArray([...authors], maxauthors) : [[...authors]]
    // fetchedSet is where each promise will add newly fetched events
    const fetchedSet : Set<NostrEvent> = new Set()
    const promises : Promise<void>[] = []
    let promise : Promise<void>

    console.log("GrapeRank : nostr protocol : fetching events in ",authorslists.length, " requests for ",authors.size," raters")
    // send one relay request per `maxauthors` sized list of authors
    for(let index in authorslists){
      let fetchfilter : NostrFilter = {
        ...this.request.filter, 
        authors : authorslists[index] as string[],
        kinds : this.kinds,
      }
      // delay between relay requests
      await new Promise<void>((resolve)=>{
        setTimeout(()=> resolve(), delaybetweenfetches)
      })
      promises.push(this.fetchEventsPromise(fetchfilter, fetchedSet, index  as unknown as number))
    }
    // wait for all promises to resolve
    await Promise.all(promises)
    console.log("GrapeRank : nostr protocol : fetching complete with ", fetchedSet.size, " events ")

    // add fetchedSet to this.fetched array of event sets, 
    // and return the new dos for ratings interpretation 
    return this.fetched.push(fetchedSet)
  }

  // An iterative function ... 
  // possibly calls itself again if validation fails
  // returns a single promise with possibly nested promises
  private async fetchEventsPromise(filter: NostrFilter, fetchedSet : Set<NostrEvent>, iteration = 0) : Promise<void> {
    if(!filter.authors) 
      return new Promise((resolve,reject)=> reject("No authors provided"))
    console.log("GrapeRank : nostr protocol : fetching events in request ",iteration, " for ",filter.authors?.length, " raters")
    return new Promise((resolve)=>{
      fetchEvents(filter).then(async (newFetchedSet)=>{
        let validation = true // this.validate ? this.validate(newFetchedSet, filter.authors as string[], fetchedSet) : true
        try{

          // FALSE validation will log error
          // if(validation === false ) {
          //   throw('events validaiton failed')
          // }

          // TRUE validation will add events to fetchedSet
          if(validation === true){ 
            // fetchedSet = new Set([...fetchedSet, ...newFetchedSet])
            newFetchedSet.forEach((event)=>{ fetchedSet.add(event) })
            throw("fetched " + newFetchedSet.size + " new events, for total of "+ fetchedSet.size)
          }

          // otherwise try request again with reduced authors list
          console.log("GrapeRank : nostr protocol : fetch request ",iteration," : requesting again")
          await this.fetchEventsPromise(
            {...filter, authors : validation as string[]}, fetchedSet,
            iteration )

        }catch(e){
          console.log("GrapeRank : nostr protocol : fetch request  ",iteration," complete : ", e)
        }
        resolve()
      }).catch((error)=>{
        console.log("GrapeRank : nostr protocol : ERROR in fetch request ", iteration, error)
      })
    })
  }

}


export async function  applyRatingsByTag(instance : NostrProtocol<any>, dos : number, tag = "p", rateeindex = 1, scoreindex? : number) : Promise<RatingsMap> {
  console.log("GrapeRank : nostr protocol : applyRatingsByTag()")
  let fetchedIndex = dos - 1
  const fetchedSet = instance.fetched[fetchedIndex]
  const newratingsmap : RatingsMap = new Map()
  let eventindex : number = 0, 
    totalratings : number = 0, 
    duplicateratings : number = 0, 
    rater : userId,
    ratee : elemId,
    // apply a single score for all ratings, as indicated in params.score
    defaultscore = instance.params.score as number || 0,
    defaultconfidence = instance.params.confidence as number || .5
  // loop through the events of fetchedSet to find tags for making new ratings
  for(let event of fetchedSet) {
    rater = event.pubkey
    const raterratings = new Map<string, RatingData>
    eventindex ++
    let oldduplicateratings = duplicateratings
    // console.log("GrapeRank : applyRatingsByTag : proccessing event "+eventindex+"/"+numevents+" with " + event.tags.length + " tags")
    // let eventratings : PartialRatingsList = []
    // loop through all tags of each event to find the ones to make ratings from
    // TODO iterate if more than 10000 tags in this event
    if(!!event.tags && event.tags.length < 10000){
      for(let t in event.tags){
        // `rateeindex` argument determines the tag index from which to get the ID of what's been rated
        ratee = event.tags[t][rateeindex]
        // skip for this tag if rating already exists for this rater / ratee
        if(raterratings.has(ratee)) {
          duplicateratings ++
          continue
        }
        // `tag` argument defines what event tag to makes ratings from
        if(event.tags[t][0] == tag){
          // validate pubkey before applying a rating
          if(tag == 'p' && rateeindex == 1 && !validatePubkey(event.tags[t][1])) {
            continue
          }
          raterratings.set(ratee, { 
            confidence : defaultconfidence,
            // if `scoreindex` argument has been defined...
            // and if the value of this tag[scoreindex] is a property in params ...
            // then apply a custom score per rating according to the index value in params
            score : scoreindex ? instance.params[event.tags[t][scoreindex]] as unknown as number : defaultscore,
            dos : dos
          })
          if(ratee == DEBUGTARGET)
            console.log('DEBUGTARGET : nostr-protocol : interpreted rating for target : ', raterratings.get(DEBUGTARGET))
            
          totalratings ++
        }
      }
      // console.log("GrapeRank : applyRatingsByTag : event by author proccessed with ", raterratings.size, " new ratings tags and ",  duplicateratings - oldduplicateratings, " ratings already interpreted" )
    }else{
      console.log("GrapeRank : nostr protocol : applyRatingsByTag : event not processed")
    }
    // handle big arrays with care
    // if(eventratings) ratings = await mergeBigArrays(ratings, eventratings, 10000)
    newratingsmap.set(rater,raterratings)
  }

  console.log("GrapeRank : nostr protocol : applyRatingsByTag : total interpreted ", totalratings, " new ratings and skipped ",duplicateratings," duplicate ratings for ",newratingsmap.size," authors in iteration ", fetchedIndex)
  return newratingsmap
}


export function validatePubkey(pubkey : string){
  try{
    npubEncode(pubkey)
  }catch(e){
    return false
  }
  return true
}


export function validateEachEventHasAuthor( events : Set<NostrEvent>, authors : userId[], previous? : Set<NostrEvent> ) : boolean | userId[] { 
  if(authors.length == events.size) return true
  if(!validateOneEventIsNew(events,authors,previous)) return false
  let authorswithoutevents = getEventsAuthors(events, authors) 
  return authorswithoutevents.length ? authorswithoutevents : true
}

export function validateOneEventIsNew( events : Set<NostrEvent>, authors : userId[], previous? : Set<NostrEvent> ) : boolean | userId[] { 
  if(!previous || !previous.size) return true
  previous.forEach((pevent)=>{
    events.forEach((newevent)=>{
      if(pevent.id != newevent.id) return true
    })
  })
  return false
}


export function getEventsAuthors(events: Set<NostrEvent>, exclude? : userId[]) : userId[]{
  const authors : userId[] = []
  events.forEach((event)=> {
    if(!exclude || !exclude.includes(event.pubkey))
      authors.push(event.pubkey)
  })
  return authors
}


export type pubkey = string
export type signature = string

/**
 * All data collected from Nostr relating to a collection of pubkeys
 */
export type NostrUserCache = Record<
  pubkey, {
    readonly follows : pubkey[],
    readonly followedBy : pubkey[],
    readonly mutes : pubkey[],
    readonly mutedBy : pubkey[],
    readonly reports : pubkey[],
    readonly reportedBy : pubkey[],
    // ...
  }>


/**
 * Adapted from NDK
 * @param filters 
 * @returns 
 */
async function fetchEvents(
    filters: NostrFilter | NostrFilter[]
): Promise<Set<NostrEvent>> {
    filters = filters instanceof Array ? filters : [filters]
    return new Promise((resolve) => {
        const events: Map<string, NostrEvent> = new Map();

        // console.log("GrapeRank : nostr protocol : fetchEvents() : calling fetch() for ", )

        const onEvent = (event: NostrEvent) => {
          // console.log("GrapeRank : nostr : fetchEvents() : recieved kind-"+event.kind, event.id)
            // if (!(event instanceof NostrEvent)) event = new NostrEvent(undefined, event);

            const dedupKey = deduplicationKey(event);

            const existingEvent = events.get(dedupKey);
            if (existingEvent) {
                event = dedupEvent(existingEvent, event);
            }

            // event.ndk = ndk;
            events.set(dedupKey, event);
        };

        const pool = new SimplePool()

        let h = pool.subscribeMany(
          [...relays],filters,
          {
            onevent : onEvent,
            oneose() {
              h.close()
              resolve(new Set(events.values()));
            }
          }
        )
    });
}

function dedupEvent(event1: NostrEvent, event2: NostrEvent) {
  // return the newest of the two
  if (event1.created_at! > event2.created_at!) {
      return event1;
  }
  return event2;
}

/**
 * Provides a deduplication key for the event.
 *
 * For kinds 0, 3, 10k-20k this will be the event <kind>:<pubkey>
 * For kinds 30k-40k this will be the event <kind>:<pubkey>:<d-tag>
 * For all other kinds this will be the event id
 */
function deduplicationKey(event: NostrEvent): string {
  if (
      event.kind === 0 ||
      event.kind === 3 ||
      (event.kind && event.kind >= 10000 && event.kind < 20000)
  ) {
      return `${event.kind}:${event.pubkey}`;
  } else {
      return event.id;
  }
}
