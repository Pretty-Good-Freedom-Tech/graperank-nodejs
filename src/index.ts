import { Calculator } from "@graperank/calculator";
import { Interpreter } from "@graperank/interpreter";
import { Storage } from "@graperank/storage";
import {GrapevineData, GrapevineKeys, userId, WorldviewOutput, WorldviewKeys, StorageParams, GraperankSettings, Scorecards, ProtocolRequest, protocol, InterpreterProtocolStatus, CalculatorIterationStatus, WorldviewData, DEFAULT_CONTEXT, GraperankListener, GraperankNotification, sessionid, context, timestamp, ScorecardsOutput, WorldviewSettings, ScorecardsEntry, StorageProcessor, elemId, ProtocolFactory } from "@graperank/util/types";
import { NostrProtocolFactory } from '@graperank/nostr-protocols';
import { Protocols } from "@graperank/interpreter/protocols";



// GrapeRank class has static properties and methods 
// to manage and persist GrapeRankEngine instances across client sessions
export class GrapeRank {
  private static instances : Map<userId, GrapeRankEngine> = new Map()
  
  static init( observer : userId,  storage : StorageParams, protocols : ProtocolFactory[] = []) : GrapeRankEngine {
    console.log("GrapeRank : initializing engine for : ", observer)
    let instance = this.instances.get(observer)
    if(!instance) {
      // add default nostr protocols to begining of protocols
      protocols.unshift(NostrProtocolFactory)
      instance = new GrapeRankEngine(observer, storage, protocols)
      this.instances.set(observer, instance)
    }
    return instance
  }

  static async observers(storageconfig : StorageParams) : Promise<string[]> {
    let storage =  Storage.init(storageconfig)
    return (await storage.observers.list()).list
  }
}


// GrapeRankEngine should ONLY be instantiated by GrapeRank class

export class GrapeRankEngine {
  readonly observer: userId;
  readonly storage: StorageProcessor;
  private generator: GrapeRankGenerator;
  private listeners: Map<sessionid, GraperankListener> = new Map();
  readonly protocols : Protocols

  constructor(observer: userId, storage: StorageParams, protocols : ProtocolFactory[]) {
    this.observer = observer;
    this.storage = Storage.init(storage);
    this.protocols = new Protocols(protocols)
  }

  async contexts() : Promise<string[]> {
    return (await this.storage.worldview.list({observer:this.observer})).list 
  }

  // returns worldview and keys from specified or default context
  async worldview(context?: context, update : boolean | WorldviewSettings = false) : Promise<WorldviewOutput | undefined> {
    let keys : Required<WorldviewKeys> = {
      observer : this.observer,
      context : context || DEFAULT_CONTEXT
    }
    console.log('GrapeRankEngine : worldview() : keys : ', keys);

    let worldview : WorldviewData
    if(!update){
      // retrieve worldview from storage
      worldview = await this.storage.worldview.get(keys)
      console.log('GrapeRankEngine : worldview() : retrieved worldview : ', worldview);
      // OR create first worldview ... if DEFAULT does not exist
      if(!worldview) {
        // MUST deconstruct the WORLDVIEW_DEFAULT object 
        worldview = keys.context == DEFAULT_CONTEXT ? {...WORLDVIEW_DEFAULT} : undefined;
        console.log('GrapeRankEngine : worldview() : default worldview : ', worldview);
      }
    }else{
      // create a new worldview with possibly custom settings
      // MUST deconstruct the WORLDVIEW_DEFAULT object 
      worldview = update === true ? {...WORLDVIEW_DEFAULT} : { settings: update };
      console.log('GrapeRankEngine : worldview() : new worldview : ', worldview);
    }

    if(!worldview) {
      console.log('GrapeRankEngine : worldview() : no worldview found or created');
      return undefined;
    }

    console.log('GrapeRankEngine : worldview() : returning worldview : ', { keys, worldview });
    return { keys, worldview };
  }

  // get calculated scorecards
  async scorecards(context?: context, timestamp : timestamp = 0) : Promise<ScorecardsOutput | undefined>{
    context = context || DEFAULT_CONTEXT
    if(!timestamp) {
      let {worldview} = await this.worldview(context)
      // get timestamp from `worldview.calculated`
      timestamp = worldview.calculated 
      // get timestamp from last `worldview.grapevines`
      if(!timestamp && worldview.grapevines.length) {
        timestamp = worldview.grapevines[worldview.grapevines.length -1][0] 
      }
    }
    if(timestamp){
      let keys : Required<GrapevineKeys> = { observer : this.observer, context, timestamp }
      let scorecards = await this.storage.scorecards.get(keys)
      if( scorecards) return {keys, scorecards}
    }
    return undefined
  }

  async generate(context?: context, settings? : Partial<GraperankSettings>) : Promise<WorldviewOutput | undefined> {
    let input = await this.worldview(context, true)
    let stopped = this.generator ? await this.stopCalculating(input.keys.context) : true
    if(!stopped) return undefined
    this.generator = new GrapeRankGenerator(this, input, settings)
    return await this.generator.generate()
  }

  // handles notification for listeners across all instances of GrapeRank
  notify(notification : GraperankNotification ){
    this.listeners.forEach((listener,sessionid) => {
      try{ 
        listener(notification) 
      }catch(e){
        this.listeners.delete(sessionid)
      }
    })
  }
  
  listen(sesionid : sessionid, callback : GraperankListener | false){
    if(!callback) return this.listeners.delete(sesionid)
    this.listeners.set(sesionid,callback)
    if(this.listeners.get(sesionid)) return true
    return false
  }
  
  async stopCalculating(context?: context){
    let stopped = this.generator ? await this.generator.stop() : true
    console.log('GrapeRank : stopCalculating() : generator stopped : ',stopped)
    let cleared = stopped ? await this.clearCalculating(context) : false
    console.log('GrapeRank : stopCalculating() : worldview calculating cleared : ',cleared)
    return cleared
  }

  private async clearCalculating(context?: context){
    let keys : Required<WorldviewKeys> = {
      observer : this.observer,
      context : context || DEFAULT_CONTEXT
    }
    let worldview = await this.storage.worldview.get(keys)
    if(!worldview?.calculating) return true
    worldview.grapevines.pop()
    worldview.calculating = undefined
    return await this.storage.worldview.put(keys, worldview)
  }

  // TODO rebuild worldviews from existing (stored) scorecards
  // IF worldview data was accidentally obliterated or lost ... 
  private async rebuild(){

  }

}


// generate 
class GrapeRankGenerator {

  readonly keys : Required<GrapevineKeys>
  private worldview : WorldviewData
  private grapevine : GrapevineData
  private calculator : Calculator | undefined
  private interpreter : Interpreter | undefined
  private scorecards : ScorecardsEntry[] | undefined
  private _stopping : boolean
  private _stopped : boolean

  constructor(
    private engine : GrapeRankEngine,
    input : WorldviewOutput,
    settings? : Partial<GraperankSettings>,
  ){
    this.worldview = input.worldview
    this.keys = {
      observer : input.keys.observer,
      context : input.keys.context || DEFAULT_CONTEXT,
      timestamp : 0
    } 
    this.grapevine = {
      graperank : { ...GRAPERANK_DEFAULT, ...input.worldview.settings.graperank, ...settings },
      status : {
        completed : 0,
        total : 0,
        interpreter : [],
        calculator : []
      }
    }
  }

  // get ratings() { return this.interpretations.ratings }
  get completed() { return this.grapevine.status.completed }
  
  get settings() : GraperankSettings {
    return this.grapevine.graperank //{...this.worldview?.settings?.graperank, ...this._settings }
  }
  set settings(settings : Partial<GraperankSettings>){
    this.grapevine.graperank = {...this.grapevine.graperank, ...settings}
  }
  // update the Map of worldview.grapevines with new grapevine data
  // and return sorted entries array worldview.grapevines
  private get grapevines() : [number, GrapevineData][] {
    let grapevines = new Map(this.worldview.grapevines)
    grapevines.set(this.keys.timestamp, this.grapevine)
    // sort newest timestamp is last in list
    return [...grapevines].sort((a,b)=> a[0] - b[0] )
  }

  // async initWorldview() : Promise<WorldviewData> {
  //   this.worldview = this.worldview || this.keys.context ? (await this.engine.worldview(this.keys.context)).worldview : WORLDVIEW_DEFAULT
  //   return this.worldview
  // }

  async updateInterpreterStatus(newstatus : InterpreterProtocolStatus){
    let updated = false
    this.grapevine.status.interpreter.forEach((status)=>{
      if(!updated && status.protocol == newstatus.protocol && status.dos == newstatus.dos ){
        status = newstatus
        updated = true
      }
    })
    if(!updated) this.grapevine.status.interpreter.push(newstatus)
    return await this.update('Interpretation updated for '+newstatus.protocol+ newstatus.dos ? '['+newstatus.dos+']' : '')
  }

  async updateCalculatorStatus(newstatus : CalculatorIterationStatus){
    let iteration = this.grapevine.status.calculator.length
    this.grapevine.status.calculator.push(newstatus)
    return await this.update('Calculator iteration '+iteration+' complete')
  }

  // TODO retrieving final grapevine should finalize the status object
  async updateCalculatorComplete() : Promise<GrapevineData | false> {
    this.grapevine.status.completed = Date.now() - this.keys.timestamp
    let finaliteration = this.grapevine.status.calculator[this.grapevine.status.calculator.length -1]
    for(let dos in finaliteration){
      this.grapevine.status.total += ((finaliteration[dos].calculated || 0) + (finaliteration[dos].uncalculated || 0))
    }
    if(await this.update('Calculation complete')) return this.grapevine
    return false
  }

  // private calculate = Calculator.calculate
  // private interpret = Interpreter.interpret

  async generate(scorecards? : Scorecards | undefined) : Promise<WorldviewOutput | undefined> {
    try{
      this.keys.timestamp = Date.now()
      // set worldcview.calculating
      this.worldview.calculating = this.keys.timestamp
      await this.update('Generating a new grapevine for : '+this.keys.context)

      // Interpret ratings
      const raters = getRaters(scorecards) || [this.keys.observer]
      console.log("GrapeRank : calling interpret with " ,raters.length, " authors ...")

      // initiate the interpretation and calculation engines to run in the background
      // while writing status updates to the grapevine object in storage (via GrapeRankGenerator)
      this.interpreter = new Interpreter(
        this.engine.protocols,
        this.updateInterpreterStatus.bind(this)
      )
      const interpretations = await this.interpreter.interpret(
        raters,
        this.settings.interpreters,
      ) 
      // const ratings : RatingsList = interpeterresults.ratings

      if(this.stopping || !interpretations) throw('stopping')

      // Calculate scorecards
      console.log("GrapeRank : calling calculate with "+interpretations.ratings.length+" ratings... ")
      this.calculator = new Calculator(
        this.keys.observer,
        interpretations.ratings, 
        this.settings.calculator, 
        this.updateCalculatorStatus.bind(this),
        this.updateCalculatorComplete.bind(this)
      )
      this.scorecards = await this.calculator.calculate()

      if(this.stopping || !this.scorecards) throw('stopping')

      // write to storage
      // Update worldview calculating & calculated
      if(this.grapevine.status?.completed) this.worldview.calculating = undefined
      if(this.worldview.settings?.overwrite !== false) this.worldview.calculated = this.keys.timestamp

      // set grapevine expires
      if(this.worldview.settings?.expiry) 
        this.grapevine.expires = this.keys.timestamp + this.worldview.settings.expiry
      // set graperank interpreters used for this grapevine
      // TODO these interpreters should be added to `status` during interpretation phase to generate live updates 
      let interpreters : Map<protocol,ProtocolRequest> = new Map()
      interpretations.responses.forEach((response)=>{
        interpreters.set(response.request.protocol, response.request)
      })
      this.grapevine.graperank = {
        ...this.worldview.settings.graperank,
        ...this.grapevine.graperank, 
        interpreters : [...interpreters.values()]
      }

      // send new scorecards to storage
      await this.engine.storage.scorecards.put(this.keys, this.scorecards)
      // send worldview (and grapevines) to storage 
      await this.update('Grapevine scorecards have been generated.')

      if(this.worldview.settings?.archive === false) {
        // TODO delete old grapevines
      }
      return { 
        worldview : this.worldview, 
        keys : this.keys 
      }
    }catch(e){
      this._stopped = true
      console.log('GrapeRank : generator stopped.',this.keys,e)
      return undefined
    }
  }

  private async update(message : string){
    // assure that GrapeRank worldview OR default is loaded 
    // await this.initWorldview()
    if(this.stopping) throw('stopping')
    let stored = false
    this.worldview.grapevines = this.grapevines
    stored = await this.engine.storage.worldview.put(this.keys, this.worldview)
    if(stored) this.engine.notify({message, keys : this.keys, grapevine : this.grapevine})
    return true
  }


  get stopping() { return this._stopping }
  get stopped() { return this._stopped }

  async stop(){
    if(this.worldview.calculating) {
      this._stopping = true
      if(this.interpreter) this.interpreter.stop()
      if(this.calculator) this.calculator.stop()
      while(!this.stopped){
        await new Promise( resolve => setTimeout(resolve,1000) )
      }
      return this.stopped
    }
    return true
  }


}


function getRaters(scorecards : Scorecards = []) : userId[] | undefined {
  const raters : userId[] = []
  scorecards.forEach((entry) => {
    raters.push(entry[0])
  })
  return raters.length ? raters : undefined
}


// MUST deconstruct the GRAPERANK_DEFAULT object when used
// OTHERWISE updated properties will persist across engine instances
const GRAPERANK_DEFAULT : GraperankSettings = {
  interpreters : [
    {
      protocol : "nostr-follows",
      iterate : 6
    },
    {
      protocol : "nostr-mutes",
    },
    {
      protocol : "nostr-reports",
    }
  ],
  calculator : {
    // incrementally decrease influence weight
    attenuation : .7,
    // factor for calculating confidence 
    // MUST be bellow 1 or confidence will ALWAYS be 0
    // CAUTION : too high (eg:.7) and users beyond a certain DOS (eg:2) will always have a score of zero
    rigor : .2,
    // minimum score ABOVE WHICH scorecard will be included in output
    minscore : 0,
    // max difference between calculator iterations
    // ZERO == most precise
    precision : 0,
    // devmode if off by default
    devmode : false
  },
}

// MUST deconstruct the WORLDVIEW_DEFAULT object when used
// OTHERWISE updated properties will persist across engine instances
const WORLDVIEW_DEFAULT : WorldviewData = {

  // timestamp of preffered grapevine calculation
  // calculating : undefined,
  // timestamp of preffered grapevine calculation
  // calculated : undefined,
  settings : {
    // overwrite 'calculated' timestamp when calculating new grapevine?
    overwrite : true,
    // retain historical grapevines when calculating new?
    archive : true,
    // duration for 'expires' timestamp of new grapevines from calculation time
    expiry : undefined,
    // default 'graperank' settings for new grapevine calculations
    graperank : {...GRAPERANK_DEFAULT}
  }

}
