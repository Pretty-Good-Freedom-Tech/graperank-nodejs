import { Protocols } from "./protocols"
import { forEachBigArray, DEBUGTARGET } from "../utils"
import { ProtocolRequest, RatingsList, userId , protocol, InterpreterResults, ProtocolResponse, RatingsMap, InterpreterProtocolStatus} from "../types"

export class Interpreter {
  private stopping : boolean = false
  constructor(
    readonly raters:userId[],
    readonly requests : ProtocolRequest[],
    private updateStatus? : (status : InterpreterProtocolStatus) => Promise<boolean>
  ){}
  stop(){
    this.stopping = true
  }
  async interpret() : Promise<InterpreterResults | undefined>{
    var protocol = new Protocols()
    var responses : ProtocolResponse[] = []
    var ratings : RatingsList = []
    // var requests : ProtocolRequest[] = settings.interpreters
    // `allraters` map keys hold all raters added as input and between protocol requests
    // map value is the iteration number at which the rater was added
    // (this number ends up in the scorecard as `dos` from observer) 
    const allraters : Map<userId,number> = new Map()
    var requestauthors : Set<userId> | undefined

    if(!!this.raters && !!this.requests){
      console.log("GrapeRank : interpret : instantiating ",this.requests.length, " protocols for ",this.raters.length," raters")
      console.log("----------------------------------")
      // add input raters to allraters
      this.raters.forEach((userid) => allraters.set(userid,0))

      // loop through each interpreter request
      // requests having `iterations` will ADD to `allraters` with each interation
      // each request will use the `allraters` list from previous requests
      for(let r in this.requests){
        if(this.stopping) return undefined
        let requestindex = r as unknown as number
        let request = this.requests[requestindex]
        protocol.setRequest(request)
        // reset newraters, protocolratings, and newratings between protocol requests
        const protocolratings = protocol.getInterpreted(request.protocol)
        let newraters : Set<userId> = new Set()
        let newratings : RatingsMap = new Map()
        let thisiteration : number = 0
        let maxiterations : number = request.iterate || 1
        let thisiterationraters : Set<userId>
        if(request.authors && request.authors.length) requestauthors = new Set(request.authors)
        
        let currentstatus : InterpreterProtocolStatus
        console.log("GrapeRank : interpret : calling " +request.protocol+" protocol with params : ",protocol.get(request.protocol).params)

        while(thisiteration < maxiterations){
          if(this.stopping) return undefined
          // increment for each protocol iteration
          thisiteration ++
          thisiterationraters = requestauthors || ( newraters?.size ?  newraters : new Set(allraters.keys()) )
          console.log("GrapeRank : interpret : "+request.protocol+" protocol : begin iteration ", thisiteration, " of ", maxiterations,", with ",thisiterationraters?.size," raters")
          // DEBUG
          if(thisiterationraters.has(DEBUGTARGET))
            console.log('DEBUGTARGET : interpret : target found in thisiteration raters')
          try{
            currentstatus = {
              protocol : request.protocol,
              // FIXME dos needs to be set on initial status ... 
              // how to determine this acurately BEFORE fetchData() has been called?
              dos : request.iterate ? protocol.get(request.protocol)?.fetched?.length || 0 : undefined,
              authors : thisiterationraters.size
            }
            if(this.updateStatus && !await this.updateStatus(currentstatus)) throw('failed updating initial status')
            let fetchstart = Date.now()
            // fetch protocol specific dataset for requestauthors OR newraters OR allraters
            let dos = await protocol.fetchData(request.protocol, thisiterationraters)
            // TODO cache fetched data
            currentstatus.fetched = [
                protocol.get(request.protocol).fetched[dos -1]?.size || 0, // number of fetched events
                Date.now() - fetchstart, // duration of fetch request
                thisiteration == maxiterations ? true : undefined // final DOS iteration ?
              ]
            if(this.updateStatus && !await this.updateStatus(currentstatus)) throw('failed updating status after fetch')
            let interpretstart = Date.now()
            // interpret fetched data and add to newratings
            newratings = await protocol.interpret(request.protocol, dos)
            currentstatus.interpreted = [
                countRatingsMap(newratings)|| 0, // number of interpretations rated
                Date.now() - interpretstart, // duration of interpretation
                thisiteration == maxiterations ? true : undefined // final DOS iteration ?
              ]
            if(this.updateStatus && !await this.updateStatus(currentstatus)) throw('failed updating status after interpret')

            console.log("GrapeRank : interpret : ",request.protocol," protocol : interpretation complete for iteration ",thisiteration)

            // prepare for next iteration ONLY IF not on final iteration
            if(thisiteration < maxiterations) {
              // get new raters from interpreted newratings
              newraters = getNewRaters(newratings, allraters)
              // merge all raters to include new raters
              newraters.forEach((rater) => allraters.set(rater, thisiteration))
              console.log("GrapeRank : interpret : "+request.protocol+" protocol : added " ,newraters.size, " new raters")
            }
            console.log("GrapeRank : interpretat : total ", allraters.size," raters")

          }catch(e){
            console.log('GrapeRank : interpret : ERROR : ',e)
          }

          responses.push({
            request : {...request, params : protocol.get(request.protocol).params},
            index : requestindex,
            iteration : thisiteration,
            numraters : thisiterationraters.size,
            // TODO get numfetched from protocol
            numfetched : undefined,
            numratings : newratings.size
          })

          console.log("GrapeRank : interpret : "+request.protocol+" protocol : end iteration ", thisiteration, " of ", maxiterations)
          console.log("----------------------------------")
        }

        // add the final map of protocolratings to ratings list
        addToRatingsList(request.protocol, r as unknown as number, protocolratings, ratings)
      }
      // DEBUG duplicate ratings
      let numtargetratings : Map<userId,number> = new Map()
      await forEachBigArray(ratings,(rating)=>{
        if(rating.ratee == DEBUGTARGET) {
          let numratings = numtargetratings.get(rating.rater) || 0
          numtargetratings.set(rating.rater,numratings + 1)
        }
      })
      numtargetratings.forEach((num,key)=>{
        if(num > 1)
        console.log('DEBUGTARGET : interperet : found more than ONE rating for ', key)
      }) 
    
    }else{
      console.log('GrapeRank : ERROR in interpret() : no raterts && requests passed : ', this.raters, this.requests)
    }
    protocol.clear()
    return {ratings, responses}

  }

}

// FIXME this ONLY works when USERS are being rated, not CONTENT
// TODO extraction of new authors from rated content SHOULD be handled by each protocol ...  

// TODO some protocols, like `nostr-mutes` && `nostr-reports`, should NOT append new ratees to allraters 
// the scorecards generated should ONLY include "those ratees within the [`nostr-follows`] network" ...
// maybe there should be a designated protocol that "defines the set of new raters" ?
function getNewRaters(newratings : RatingsMap, allraters? : Map<userId, number>) : Set<userId>{
  let newraters : Set<userId> = new Set()
  newratings.forEach((rateemap, rater)=>{
    rateemap.forEach((ratingdata, ratee)=>{
      if(!allraters || !allraters.has(ratee)) newraters.add(ratee)  
    })
  })
  // DEBUG
  if(newraters.has(DEBUGTARGET))
    console.log('DEBUGTARGET : interpret : target found by getNewRaters()')
  return newraters
}

function addToRatingsList(protocol : protocol, index : number, ratingsmap : RatingsMap, ratingslist: RatingsList){
  ratingsmap.forEach((rateemap,rater)=>{
    rateemap.forEach((ratingdata,ratee)=>{
      ratingslist.push({
        protocol,
        index,
        rater,
        ratee,
        ...ratingdata
      })
    })
  })
}


function countRatingsMap(ratingsmap : RatingsMap){
  let count = 0
  ratingsmap.forEach((rateemap)=>{
    rateemap.forEach(()=>{
      count ++
    })
  })
  return count
}
