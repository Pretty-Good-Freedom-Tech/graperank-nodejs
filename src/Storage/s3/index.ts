import { GrapevineKeys, ScorecardKeys, WorldviewKeys, WorldviewData, StorageType, StorageProcessor, StorageFileList, s3Config, ScorecardsEntry, StorageOperations } from "@graperank/util/types"
import { s3Api } from "./s3api"

export class s3Processor implements StorageProcessor {

  observers : { list: () => Promise<StorageFileList | undefined> }
  worldview : StorageOperations<WorldviewKeys, WorldviewData>
  scorecards : StorageOperations<GrapevineKeys, ScorecardsEntry[]>

  constructor(config : s3Config) {
    if(!config) throw('GrapeRank : Storage : missing config required for s3Processor');
    let s3 = new s3Api(config)

    this.observers = {
      async list() { 
        // list of all 'worldview' observers by passing an empty object for keys
        return await filelist(s3, 'worldview', {}, true)
      }
    }
    
    this.worldview = { 
      async list(keys? : WorldviewKeys, getall? : boolean ) { 
        return keys ? await filelist(s3, 'worldview', keys, getall) : await filelist(s3, 'worldview', '', getall)
      },
    
      // store the worldview settings event for calculating a grapevine
      async put(keys : WorldviewKeys, data : WorldviewData) {
        let success = false
        let s3key = getS3key('worldview',keys)
        if(s3key) success = await s3.put(s3key,data, true)
        return success
      },
    
      // retrieve the worldview settings event for calculating a grapevine
      async get(keys : WorldviewKeys) {
        let data : WorldviewData | undefined
        let s3key = getS3key('worldview',keys)
        if(s3key) data = await s3.get(s3key)
        return data 
      },
    
    }

    this.scorecards = { 
      // get list of all userid for a single grapevine calculation
      async list(keys : GrapevineKeys, getall? : boolean){ 
        return await filelist(s3, 'scorecards', keys, getall)
      },
      async get(keys : GrapevineKeys) {
        if (!keys.timestamp) {
          let fileslist = await filelist(s3, 'scorecards', keys, true)
          let timestamps = await getScorecardsTimestamps(fileslist);
          keys.timestamp = timestamps[0] || undefined;
        }
        let data : ScorecardsEntry[] | undefined
        let s3key = getS3key('scorecards',keys)
        if(s3key) data = await s3.get(s3key)
        return data 
      },
      // put all scorecards for a grapevine
      // TODO delete scorecards or try again if put returns false
      async put(keys : Required<GrapevineKeys>, data : ScorecardsEntry[]){
        let s3key = getS3key('scorecards',keys)
        if(s3key) return await s3.put(s3key,data, true)
        return false
      }
    }
  }
}


function getS3key(type : StorageType, keys : Partial<ScorecardKeys> | string, forlist : boolean | string = false) : string | undefined{
  let keystrings : string[]
  let keylist : string[] = [type]
  let keylength : number = 0
  if(type == 'worldview') keylength = forlist ? 1 : 2
  if(type == 'scorecards') keylength = forlist ? 2 : 3

  // ERROR invalid type passed
  if(!keylength) return undefined

  // if passed a string as keys then simply replace the last index and return the string
  if(typeof keys == 'string'){
    keystrings = keys.split('/') 
    if(keystrings[0] == type && keystrings.length == keylength){
      if(typeof forlist == 'string') keystrings[keystrings.length -1] = forlist
    }
    return keystrings.join('/') 
  }
  // coerce keys to an array of strings in a specific order
  if(typeof keys == 'object'){
    keystrings = [
      keys.observer?.toString() || '',
      keys.context?.toString() || '' ,
      keys.timestamp?.toString() || '',
      keys.subject?.toString() || '']
    // for the number of iterations specified in keylength
    // append strings from keystrings[] to keylist[]
    while(keylength >= keylist.length){
      let keystring = keystrings[keylist.length -1]
      if(keystring){ 
        keylist.push(keystring) 
      }else{ 
        // only append existing keystrings in order
        // if a keystring is missing then abort and return keylist
        continue
      }
    }
    // join keylist and return a string
    return keylist.join('/')
  }
}

async function filelist( s3 :s3Api, type : StorageType, keys : Partial<ScorecardKeys> | string , iterate? : boolean | StorageFileList) : Promise<StorageFileList | undefined>{
  console.log('GrapeRank : Storage : s3 processor : filelist called for : ', type)
  let s3key = typeof keys == 'string' ? keys : getS3key(type, keys, true)
  let filelist : StorageFileList | undefined
  // get the filelist from s3
  if(s3key) filelist = await s3.list(s3key) // || {list : []}
  // merge previous results
  if(typeof iterate == 'object' && !!iterate?.list){
    filelist?.list.push(...iterate.list)
  }
  // determine if we should iterate again or not
  if(iterate && filelist?.next){ 
    // s3key = s3Processor.key(type, keys, filelist.next)
    // if(s3key) return s3Processor.filelist(type, s3key, filelist)
    console.log('GrapeRank : Storage : s3 processor : filelist iteration canceled')
  }
  // else return the results
  console.log('GrapeRank : Storage : s3 processor : filelist returned with : ', filelist.list.length, " files")
  return filelist
}

async function getScorecardsTimestamps(fileslist : StorageFileList, index = 0): Promise<number[]> {
  const timestampregex = /\d{9,}/g;
  let timestamplist: number[] = [];

  fileslist.list.forEach((filename) => {
    let match = filename.match(timestampregex);
    if (match && match[index]) {
      timestamplist.push(parseInt(match[index], 10));
    }
  });

  // sort list in chronological order (newest first)
  timestamplist.sort((a, b) => b - a);

  console.log('GrapeRank : Storage : getCalculationTimestamps() returned with ', timestamplist[0], ' newest in list of ', timestamplist.length, ' timestamps');
  return timestamplist;
}



