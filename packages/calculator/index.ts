import type { CalculatorParams, CalculatorSums, elemId, protocol, Rating, RatingsList, Scorecard, ScorecardData, ScorecardInterpretation, CalculatorIterationStatus, ScorecardsEntry, userId } from "@graperank/util/types"
import { DEBUGTARGET } from "@graperank/util"

// var params : Required<CalculatorParams>

export class Calculator {

  constructor(
    readonly observer : userId,
    readonly ratings : RatingsList,
    params? : Partial<CalculatorParams>,
    private updateStatus? : (newstatus : CalculatorIterationStatus) => Promise<void>,
    private updateComplete? : () => Promise<void>
  ){
    if(params) this.params = {...this.params, ...params}
  }

  readonly params : Required<CalculatorParams> = {
    // incrementally decrease influence weight
    attenuation : .5,
    // factor for calculating confidence 
    // MUST be bellow 1 or confidence will ALWAYS be 0
    // CAUTION : too high (eg:.7) and users beyond a certain DOS (eg:2) will always have a score of zero
    rigor : .5,
    // minimum score ABOVE WHICH scorecard will be included in output
    minscore : 0,
    // max difference between calculator iterations
    // ZERO == most precise
    precision : 0.00001,
    // devmode if off by default
    devmode : false
  }

  private calculators : Map<elemId,ScorecardCalculator> = new Map()

  private _stopped : boolean = false

  stop(){
    this._stopped = true
  }

  /**
   * Calculate new scorecards from interpreted ratings and input scorecards
   */
  async calculate () : Promise<ScorecardsEntry[]> {

    console.log("GrapeRank : Calculator : instantiated with ",this.ratings.length," ratings and params : ", this.params)

    // setup
    // STEP A : initialize ratee scorecard
    // Retrieve or create a ScorecardCalculator for each ratee in ratings
    for(let r in this.ratings){
      if(!this.ratings[r]) continue
      let ratee = this.ratings[r].ratee
      let rater = this.ratings[r].rater
      if(ratee && !this.calculators.get(ratee)){
        // TODO get scores for each rater from worldview input cards
        // let ratercard = getInputScorecard(rater as string)
        let calculator = new ScorecardCalculator( this.observer, ratee , this.params)
        if(calculator) this.calculators.set(ratee, calculator)
      }
    }
    console.log("GrapeRank : Calculator : setup with ",this.calculators.size," calculators.")

    await this.iterate()

    if(this.updateComplete) await this.updateComplete() 

    return this.scorecards
  }

  // returns number of scorecards calculated
  private async iterate() : Promise<number | undefined> {
    let calculating : number = 0
    let calculated : number = 0
    let uncalculated : string[]
    let notcalculatedwarning : number = 0
    let prevcalculating = 0
    let prevcalculated = 0
    let iteration = 0
    let iterationscores : number[] = []
    let iterationstatus : CalculatorIterationStatus

    while(calculated < this.calculators.size){
      if(this._stopped) return undefined
      iteration ++
      prevcalculating = calculating
      prevcalculated = calculated
      calculating = 0
      calculated = 0
      uncalculated = []
      iterationstatus = {}
      console.log("------------ BEGIN ITERATION : ", iteration, " --------------------")
      
      // STEP B : calculate sums
      // Add rater's rating to the sum of weights & products for the ratee scorecard
      for(let r in this.ratings){
        if(!this.ratings[r]) continue
        let calculator = this.calculators.get(this.ratings[r].ratee)
        let raterscore = this.calculators.get(this.ratings[r].rater as string)?.score
        if(calculator) {
          calculator.sum( this.ratings[r], raterscore)
        }
      }

      // STEP C : calculate influence
      // calculate final influence and confidence for each ratee scorecard
      // call calculate again if calculation is NOT complete
      this.calculators.forEach( (calculator, rater) => {
        var dos = calculator.dos || 0
        iterationstatus[dos] = iterationstatus[dos] || {
          calculated : 0,
          uncalculated : 0,
          average : 0
        }
        if( !calculator.calculated ){
          calculator.calculate()
          calculating ++
        }
        if(calculator.calculated){
          calculated ++
          // add to dos status for calculated
          iterationstatus[dos].calculated ++
          // DOS average is SUM of all calculated scores UNTIL converted to an average 
          iterationstatus[dos].average += calculator.score
        }else{
          uncalculated.push(rater)
          // add to dos status for uncalculated
          iterationstatus[dos].uncalculated ++
        }
      }) 
      // calculate averages scores for each DOS status
      for(var dos in iterationstatus){
        iterationstatus[dos].average = iterationstatus[dos].average / iterationstatus[dos].calculated 
      }
      if(this.updateStatus) await this.updateStatus({...iterationstatus})

      // LOG iteration
      iterationscores = logScoresForIteration(this.calculators)

      console.log("TOTAL number scorecards : ", this.calculators.size )  
      console.log("TOTAL scorecards calculating this iteration : ", calculating)
      console.log("TOTAL scorecards calculated : ", calculated)
      // halt iterator if needed
      if( uncalculated.length ){
        if(calculated == prevcalculated && calculating == prevcalculating ){
          notcalculatedwarning ++
          console.log("WARNING ",notcalculatedwarning," : scores did not change for ", calculating," scorecards in calculate()")
          if(notcalculatedwarning > 4) {
            console.log("HALTING iterator : due to unchanging scores for the following raters : ", uncalculated)
            calculated = this.calculators.size
          }
        }
        if(iteration > 100){
          console.log("HALTING iterator : exeded MAX 100 iterations in calculate() ")
          calculated = this.calculators.size
        }
      }
      console.log("------------ END ITERATION : ", iteration, " --------------------")
    }
    return calculated

  }

  get scorecards() : ScorecardsEntry[] {
    let scorecards : [elemId, Required<ScorecardData>][] = []
    this.calculators.forEach((calculator) => {
      if(calculator.output) scorecards.push(calculator.output)
    })
    // sort first : scorecards with higher scores and most ratings
    return scorecards.sort((a ,b )=>{
      return  a[1].score - b[1].score ||  a[1].interpretersums['nostr-follows']?.numRatings - b[1].interpretersums['nostr-follows']?.numRatings 
    })
  }

}


const zerosums : CalculatorSums = {
  weights : 0,
  products : 0
}

/**
 * Calculates a single scorecard for a given subject (ratee)
 */
class ScorecardCalculator {

  get output() : [elemId, Required<ScorecardData>] | undefined {
    if(!this.calculated || this._data.score < this.params.minscore) return undefined
    return [ this._subject, this._data ]
  }
  // get scorecard() : Required<Scorecard> | undefined { 
  //   // if(!this.calculated) return undefined
  //   return {
  //     ...this.keys,
  //     subject : this._subject,
  //     ...this._data
  //   }
  // }
  // sum() can only be run as many times as we have ratings
  // get summed(){ return this._sumcount < ratings.length ? false : true }
  get calculated(){ 
    return this._calculated ? true : false
  }

  get dos() : number | undefined {
    // TODO interpreter should designate a protocol that determines DOS
    // using 'nostr-follows' for now
    return this._meta.get('nostr-follows')?.dos || 0
  }

  get score() : number {
    return this._data?.score || 0
  }
  // constructor(subject : elemId)
  // constructor(scorecard : Scorecard)
  constructor(
    readonly observer : userId, 
    input : elemId | Scorecard, 
    private params : Required<CalculatorParams>
  ){
      // input is subject of new scorecard
      this._subject = typeof input == 'string' ?  input :  input.subject as string
  }

  // STEP B : calculate sums
  // calculate sum of weights & sum of products
  sum( rating : Rating, raterscore ? : number){

    // // do nothing if ratercard.subject does not match rating.rater
    // if(ratercard && ratercard.subject != rating.rater){
    //   console.log("GrapeRank : ScorecardCalculator : WARNING ratercard.subject does not match rating.rater")
    //   return
    // }

    // ALWAYS run calculater ... to assure score convergence for "more distant" dos
    // if(this.calculated) {
    //   return
    // }

    // determine rater influence
    let influence = rating.rater == this.observer ? 1 : raterscore || 0
    let weight = influence * rating.confidence; 
    // no attenuation for observer
    if (rating.rater != this.observer) 
      weight = weight * (this.params.attenuation);

    // add to sums
    this._sums.weights += weight
    this._sums.products += weight * rating.score

    // get the metadata entry for this protocol
    let protocolmeta = this._meta.get(rating.protocol)
    // create new metadata entry for this protocol, using existing values as available
    protocolmeta = { 
      // dos = the minimum nonzero iteration number for ratings used to calculate this scorecard 
      dos : 
        rating.dos && protocolmeta?.dos && rating.dos < protocolmeta.dos ? 
          rating.dos : protocolmeta?.dos || rating.dos,
      // weighted = weighted sum of protocol ratings calculated in this scorecard
      weighted : weight + (protocolmeta?.weighted || 0),
      // numRatings = number of protocol ratings for this subject
      numRatings : 1 + (protocolmeta?.numRatings || 0),
      // numRatedBy = number of protocol ratings for observer by this subject
      numRatedBy : (rating.ratee == this.observer ? 1 : 0) + (protocolmeta?.numRatedBy || 0)
    }
    // assure that the metadata entry is updated for this protocol, in case it was undefined before.
    this._meta.set(rating.protocol, protocolmeta)

    // DEBUG
    if(this._subject == DEBUGTARGET){
      console.log('DEBUGTARGET : calculator._sums for target : ', this._sums)
      console.log('DEBUGTARGET : calculator._meta for target : ', this._meta)
    }
  }

  // STEP C : calculate influence
  // returns true if score was updated
  calculate() : boolean {

    if(this._subject == DEBUGTARGET){
      console.log('DEBUGTARGET : caling calculator.calculate() for target : ')
    }

    // ALWAYS run calculater ... to assure score convergence for "more distant" dos
    // if(this.calculated) return true

    // calculate score
    let confidence = 0
    let score = 0
    let interpretersums : Record<protocol,ScorecardInterpretation> = {}

    // convert metadata map to pojo
    this._meta.forEach((scorecardmeta,protocol) => interpretersums[protocol] = scorecardmeta )

    // If weights == 0 then confidence and score will also be 0
    if(this._sums.weights > 0){
      // STEP D : calculate confidence
      confidence = this.confidence
      score = this._average * confidence
    }

    // determine if calculator iterations are complete based on calculator.precision
    // ONLY after scores have been calculated at least ONCE (if `this._claculated` has been set)
    this._calculated = this._calculated === undefined ? false 
      : Math.abs(score - this._data.score) <= this.params.precision ? true : false

    // zero the sums
    this._sums  = {...zerosums};

    // output the scorecard
    this._data = { confidence, score, interpretersums }
    return this.calculated
  }

  private _calculated : boolean | undefined
  private _subject : elemId 
  private _data : Required<ScorecardData> 
  private _meta : Map<protocol, ScorecardInterpretation> = new Map()
  // TODO refactor this._sums as this._input in the format of scorecard.input
  private _sums : CalculatorSums = {...zerosums}
  private get _average(){ 
    let average = 0
    try{
      average = this._sums.products / this._sums.weights
    }catch(e){}
    return average <= 0 ? 0 : average
  }
  // STEP D : calculate confidence
  private get confidence(){
    // TODO get default rigor
    let rigor = this.params.rigor !== undefined ? this.params.rigor : .25
    const rigority = -Math.log(rigor)
    const fooB = -this._sums.weights * rigority
    const fooA = Math.exp(fooB)
    const certainty = 1 - fooA
    return certainty.toPrecision(4) as unknown as number // FIXME
  }

}


// LOG iteration
function logScoresForIteration(calculators :  Map<elemId,ScorecardCalculator>) : number[] {

    let scorecards : ScorecardData[] = [] 
    let increment  = .1
    let scores : number[] 
    let v = "", ov = ""

    calculators.forEach((calculator) => {
      if(calculator.output) scorecards.push( calculator.output[1])
    })

    scores = countScorecardsByScore(scorecards, increment)
    // console.log("scores counted", scores)

    for(let i in scores){
      ov = v || "0"
      v = ((i as unknown as number) * increment).toPrecision(2)
      console.log("number of cards having scores from "+ ov +" to " +v+ " = ", scores[i])
    }
    return scores
}


function countScorecardsByScore(scorecards : ScorecardData[], increment : number ) : number[] {
  let grouped = groupScorecardsByScore(scorecards,increment)
  let count : number[] = []
  let index = 0
  for(let g in grouped){
    count[index] = grouped[g].length
    index ++
  }
  return count
}

function groupScorecardsByScore(scorecards : ScorecardData[], increment : number ) : ScorecardData[][] {
  let group : ScorecardData[][] = []
  for(let s in scorecards){
    let card = scorecards[s]
    if(card?.score != undefined){
      let groupid = Math.floor(card.score / increment)
      if(!group[groupid]) group[groupid] = []
      group[groupid].push(card)
    }
  }
  return group
}
