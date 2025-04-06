/**
 * CONSTANTS
 */
export const DEFAULT_CONTEXT = "grapevine-web-of-trust-demo"
// export const DEFAULT_CONTEXT= "grapevine-web-of-trust"

/**
 * Primitives
 */
export type sessionid = string
export type userId = string | number
export type kindId = string | number
export type elemId = string
export type context = string
export type lowercase = Lowercase<string>
export type protocol = `${lowercase}-${lowercase}` // '[source]-[datatype]' ( EXAMPLE : 'nostr-follows' )
export type dos = number

export type timestamp = number
export type timestring = string

export type ParamValue = string | number | boolean
export type ParamsArray = Array<ParamValue> 
export type ParamsObject = {
  [k:string] : ParamValue | ParamsArray
}


// GrapeRank interfaces

export type GraperankSettings = {
  // any worldview MAY use another worldview or (calculated) grapevine as input
  input? : GrapevineKeys,
  // any number of interpreters may be processed in a given worldview.
  interpreters: ProtocolRequest[],
  calculator?: Partial<CalculatorParams>,
}
export type GrapeRankOutput = {
  keys : GrapevineKeys
  worldview? : WorldviewData
  scorecards? : ScorecardsEntry[]
}
// output from GrapeRank.worldview() = GrapeRankOutput with required `worldview`
export interface WorldviewOutput extends Omit<GrapeRankOutput, 'scorecards' | 'worldview'>, Required<Pick<GrapeRankOutput,'worldview'>> {}
// output from GrapeRank.scorecards() = GrapeRankOutput with required `keys` and `scorecards`
export interface ScorecardsOutput extends Omit<GrapeRankOutput, 'scorecards' | 'worldview'>, Required<Pick<GrapeRankOutput,'scorecards'>> {
  keys : Required<GrapevineKeys>
}

export type GraperankNotification = { 
  message: string, 
  keys? : Required<GrapevineKeys>, 
  grapevine? : GrapevineData
}
export type GraperankListener = ( notification : GraperankNotification ) => void



// Worldview interfaces

export interface Worldview extends Required<WorldviewKeys>,  WorldviewData {}

export type WorldviewKeys = {
  // observer is always required when requesting or instantiatng a worldview
  observer : userId,
  // context string may be ommitted when requesting
  context? : context,
}
export interface WorldviewData {
  // timestamp of current grapevine calculation
  calculating? : timestamp
  // timestamp of most recently generated grapevine
  calculated? : timestamp
  // timestamp of `default` grapevine ... if different from 'calculated'
  default? : timestamp
  // embeded grapevine data from each calculation
  grapevines? : [timestamp,GrapevineData][]
  // settings for grapevine generation
  settings? : WorldviewSettings
}

export type WorldviewSettings = {
    // overwrite 'calculated' timestamp when calculating new grapevine?
    overwrite? : boolean
    // retain historical grapevines when calculating new?
    archive? : boolean
    // default 'graperank' settings for new grapevine calculations
    graperank? : GraperankSettings
    // duration for 'expires' timestamp of new grapevines from calculation time
    expiry? : timestamp
}


// Grapevine interfaces

export interface Grapevine extends Required<GrapevineKeys>, GrapevineData {}

export interface GrapevineKeys extends Required<WorldviewKeys> {
  timestamp? : timestamp, // timestamp when Grapevine generation starts
}
export interface GrapevineData extends GrapevineMeta {
  // summary : Record<scoreindex,number>, // number of calculated scorecards by scoreindex
  status? : GrapevineStatus
}
export type GrapevineMeta = {
  graperank? : GraperankSettings
  expires? : number | false,
}
export type GrapevineStatus = {
  completed? : number // duration of elapsed Grapevine generation time in miliseconds
  total? : number // total number of scorecards generated in this Grapevine
  message? : string // string output 
  interpreter? : Array<InterpreterProtocolStatus> // interpreter status updated with each 
  calculator? :  Array<CalculatorIterationStatus> // status output upodated with each calculator iteration
}
export type InterpreterProtocolStatus = {
  protocol : protocol
  dos? : dos 
  authors : number // number of authors for events requested in this protocol DOS 
  fetched? : [number, number, true?], // number of events fetched, duration, and if fetching is complete for this protocol DOS
  interpreted? : [number, number, true?] // number of interpretations generated, duration, and if interpretation is completed for this protocol DOS
}
export type CalculatorIterationStatus = Record< 
  dos, {
    calculated? : number // number of scorecards whose calculation cycle is complete
    uncalculated? : number // number of scorecards whose calculation cycle is incomplete at this iteration
    average? : number // average score of all scorecards at this DOS
  }>



// Scorecard interfaces

// TODO rename `Scorecard` to `Observation`
// only {subject, score, confidence} is required for storage
export interface Scorecard extends 
  Required<Pick<ScorecardKeys,'subject'>>,
  Partial<Omit<ScorecardKeys, 'subject'>>,
  // Required<ScorecardKeys>,
  ScorecardData
  {}

export interface ScorecardKeys extends GrapevineKeys{
  subject? : userId | elemId,
}
// export interface ScorecardScoresKeys extends GrapevineKeys {
//   scoreindex? : scoreindex
// }
export type ScorecardData = {
  confidence? : number, // 
  // TODO rename `score` to `output`
  score? : number, // influence score
  // meta = data collected from each protocol used for this calculation (in order of execution)
  interpretersums? : Record<protocol,ScorecardInterpretation>
}
export type ScorecardInterpretation = {
  // index : number, // the order in which this protocol was executed 
  dos? : number, // the DOS at which ratings for this subject were first interpretred by the this protocol (undefined = not a DOS protocol)
  weighted : number, // weighted sum of protocol ratings calculated in this scorecard
  numRatings : number, // number of protocol ratings for this subject
  numRatedBy : number, // number of protocol ratings by this subject for observer
}


// ALL properties are required for scorecard export (to external services)
export interface ScorecardExport extends Required<Scorecard> {}

export type Scorecards = Map<elemId, ScorecardData> | ScorecardsEntry[]
export type ScorecardsMap = Map<elemId, ScorecardData>
export type ScorecardsEntry = [elemId, ScorecardData]




// Storage Interfaces

export type StorageType =  'worldview' | 'scorecards' 

// configure the storage engine upon instantiation
export type StorageParams = {
  // provide a string to reference an existing implmentation StorageProcessor
  // or provide reference to a new StorageProcessor implmentation
  processor : string | StorageProcessor
  // provide credentials and other info needed by the storage backend
  config : StorageConfig
}

export type StorageConfig = {} // ParamsObject
export interface s3Config extends StorageConfig {
  region : string,
  endpoint : string,
  key : string,
  secret : string,
  bucket : string
}

export type StorageFileList = { list :string[], next?:string } 

export interface StorageOperations<KeysType , DataType>  {
  list? : (keys : KeysType, getall? : boolean) => Promise< StorageFileList | undefined>
  put? : (keys: Required<KeysType>, data: DataType, overwrite? : boolean) => Promise<boolean>
  get : (keys: KeysType) => Promise<DataType | undefined>
  query? : (match : (data: Partial<DataType>) => boolean | undefined) => Promise<DataType[] | undefined>
  delete? : (keys: Partial<KeysType>, deleteall? : boolean) => Promise<boolean>
} 

export abstract class StorageProcessor {
constructor (config : StorageConfig) {}

// retrieve a list of all observers
observers : { list? : () => Promise< StorageFileList | undefined>}

// store and retrieve worldview settings for calculating a grapevine
// as well as the details of each grapevine calculation
worldview : StorageOperations<WorldviewKeys, WorldviewData>

// query to return FULL scorecards from ANY grapevine
scorecards : StorageOperations<GrapevineKeys, ScorecardsEntry[]>

// for interpreter protocols to cache fetched data 
// interpretercache? : StorageOperations<InterpreterCacheKeys, any>
}

// type InterpreterCacheKeys = {
//   protocol : protocol,
//   author : userId,
//   eventid? : elemId
// }




// Interpreter Interfaces
export type InterpreterResults = {
  ratings : RatingsList
  responses : ProtocolResponse[]
}
export type ProtocolResponse = {
  request : ProtocolRequest
  index : number
  iteration : number
  numraters? : number
  numfetched? : number
  numratings? : number
}

export type ProtocolRequest = {
  // should the interpretation protocol be requested from another domain?
  // TODO specify an API over HTTP for ProtocolRequest and InterpreterResults 
  domain? : string,
  // machine readable name of the protocol 
  // in the format : '[source]-[datatype]', eg : 'nostr-follows' 
  protocol : protocol 
  // params to pass to the protocol
  // used for interpreting fetched content as new ratings
  params? : ProtocolParams
  // how deep should the protocol be run?
  // each iteration generates a list of new ratings from input authors
  // and also a list of new authors from each content or user being rated
  // this will be used as author input for the next iteration.
  iterate? : number,
  // add filter parameters to the fetch request (applicable filters depend on the protocol)
  filter? : ParamsObject,
  // initial authors list for fetching content and generating ratings
  // if left blank, observer ID will be used as a single author
  authors? : userId[] // optional list of userId
  //
}

export type ProtocolParams = {
  score : number,
  confidence : number,
  [param:string] : ParamValue | undefined,
}

// to implement a custom interpretation protocol...
export interface InterpretationProtocol<ParamsType extends ProtocolParams> {
  // outputs JsonDoc formatted schema of allowed params for API documentation of each instance
  readonly schema? : string
  // the request object as set by interpret API
  request : ProtocolRequest
  // params for interpretation (should return merged default and requested params)
  params : ParamsType
  // an array of ALL data sets fetched by this protocol instance, 
  // each call to fetchData() produces ONE set in `fetched` array
  // whereby any NEW protocol iteration uses NEW raters from the previous iteration,
  // every protocol iteration can represent ONE 'degree of separation' from the original raters list
  readonly fetched : Set<any>[]
  // a map of ALL UNIQUE ratings indexed by rater and ratee
  // each call to interperet() method adds additional records to this map 
  readonly interpreted : RatingsMap 
  // a callback to fetch data. called by Interpreter API, adds a new set to fetched 
  // returns `fetchedIndex`, the index (dos) of the fetchedSet which was just added
  fetchData(this : InterpretationProtocol<ParamsType>, authors? : Set<userId>) : Promise<number>
  // a callback for interpreting data. called by Interpreter API
  // use `fetchedIndex` to specify a set of fetched data to interpret
  // returns the interpreted data ONLY from specified set of fetched (not the entire set of interpteted)
  interpret(this : InterpretationProtocol<ParamsType>, fetchedIndex? : number) : Promise<RatingsMap>
}

export interface ProtocolFactory extends Map<string, () => InterpretationProtocol<ProtocolParams>>{}


// TODO rename `Rating` to `Interpretation` 

// a list of explicit rating objects for API import or export
// derived from RatingsProtocolMap
export type RatingsList = Rating[]
export interface Rating extends RatingKeys, RatingData {
  protocol : protocol // the protocol by which this rating was interpreted
  index : number, // the order in which this protocol was executed (from entry order in RatingsProtocolMap)
}

// a map of RatingData provided by interpreter 
// where each rating is indexed by rater and ratee IDs 
// to assure no duplicate ratings are interpreted or calculated
export type RatingsMap = Map<userId, Map<elemId, RatingData>>
// export type RatingsProtocolMap = Map<protocol, RatingsMap>

export type RatingKeys = {
  // observer? : userId,
  rater : userId,
  ratee : elemId,
}

// RatingData is provided by protocol interpreter 
export type RatingData = {
  confidence : number // 0 - 1
  // TODO rename 'score' to `value`
  score : number // 0 or 1 / percent
  dos? : number // first protocol iteration at which this rating was interpreted
}





// Calculator Interfaces
export type CalculatorParams = {
  // default infulence score 
  // score : number 
  // incrementally decrease influence weight
  attenuation : number  // 0 -1 
  // factor for calculating confidence
  rigor : number // 0 -1
  // minimum weight for scorecard to be calculated
  minscore : number // 0 - 1 
  // max difference between calculator iterations
  // ZERO == most precise
  precision : number
  // TODO implement dev mode for engine
  devmode? : boolean
}

export type DevParams = {
  samplerater? : userId,
  sampleratee? : elemId
}

/**
 * TODO
 * GrapeRank Request Schema
 * parameter definitions for calling ApiRequest,
 */
export type RequestSchema = {
  protocols? : {[protocol : protocol] : JsonSchema}
  calculator? : JsonSchema
}
export type JsonSchema = {
  required : string[], 
  properties : {}
}

export type CalculatorSums = {
  weights : number,
  products : number,
}

export type ScorecardDafults = {
  confidence : number // 0 - 1
  // score : number // number
  score : number // number
}



// Utility Interfaces

/**
 * IntRange
 * https://ricardobalk.nl/blog/typescript/ranged-numbers
 * 
 * example :
 * type percent = IntRange<0,100>
 * let myvalue : percent = 101 // ERROR
 */
type Enumerate<N extends number, Acc extends number[] = []> = Acc['length'] extends N
  ? Acc[number]
  : Enumerate<N, [...Acc, Acc['length']]>
// type Enumerate<N extends number> = Partial<Record<keyof any, never>> extends infer O ? { [K in keyof O]: K extends N ? never : K } : never;
type IntRange<F extends number, T extends number> = Exclude<Enumerate<T>, Enumerate<F>>

export type percent = IntRange<0,101>
export type oneorzero = 0 | 1
export type onetofive = 1 | 2 | 3 | 4 | 5
export type onetoten = IntRange<1,10>
export type scoreindex = 
   0 |  1 |  2 |  3 |  4 |  5 |  6 |  7 |  8 |  9 |
  10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 |
  20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 |
  30 | 31 | 32 | 33 | 34 | 35 | 36 | 37 | 38 | 39 |
  40 | 41 | 42 | 43 | 44 | 45 | 46 | 47 | 48 | 49 |
  50 | 51 | 52 | 53 | 54 | 55 | 56 | 57 | 58 | 59 |
  60 | 61 | 62 | 63 | 64 | 65 | 66 | 67 | 68 | 69 |
  70 | 71 | 72 | 73 | 74 | 75 | 76 | 77 | 78 | 79 |
  80 | 81 | 82 | 83 | 84 | 85 | 86 | 87 | 88 | 89 |
  90 | 91 | 92 | 93 | 94 | 95 | 96 | 97 | 98 | 99 | 100

  // '0' |  '1' |  '2' |  '3' |  '4' |  '5' |  '6' |  '7' |  '8' |  '9' |
  // '10' | '11' | '12' | '13' | '14' | '15' | '16' | '17' | '18' | '19' |
  // '20' | '21' | '22' | '23' | '24' | '25' | '26' | '27' | '28' | '29' |
  // '30' | '31' | '32' | '33' | '34' | '35' | '36' | '37' | '38' | '39' |
  // '40' | '41' | '42' | '43' | '44' | '45' | '46' | '47' | '48' | '49' |
  // '50' | '51' | '52' | '53' | '54' | '55' | '56' | '57' | '58' | '59' |
  // '06' | '61' | '62' | '63' | '64' | '65' | '66' | '67' | '68' | '69' |
  // '70' | '71' | '72' | '73' | '74' | '75' | '76' | '77' | '78' | '79' |
  // '80' | '81' | '82' | '83' | '84' | '85' | '86' | '87' | '88' | '89' |
  // '90' | '91' | '92' | '93' | '94' | '95' | '96' | '97' | '98' | '99' | '100'