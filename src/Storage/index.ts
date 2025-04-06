import {StorageProcessor, StorageParams } from "@graperank/util/types"
import { s3Processor } from "./s3";

export namespace StorageProcessors {
  export const s3 = s3Processor
}

export class Storage {

  static init(params: StorageParams) : StorageProcessor {
    if(!params.config) throw('GrapeRank : Storage : missing config required for Storage');
    if (typeof params.processor == 'string' && !StorageProcessors[params.processor]) 
      throw('GrapeRank : Storage : ERROR invalid storage processor provided.')

    let storage : StorageProcessor = typeof params.processor == 'string'
      ? new StorageProcessors[params.processor](params.config)
      : params.processor;
    
    return storage
  }
}
