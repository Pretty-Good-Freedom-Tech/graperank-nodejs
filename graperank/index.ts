import { StorageProcessor, ProtocolFactory, s3Config, userId } from "@graperank/util/types";
import { NostrProtocolFactory } from '@graperank-protocols/nostr';
import { Protocols } from "@graperank/interpreter/protocols";
import { s3Processor } from "@graperank-storage/s3";
import { GrapeRankEngine } from "@graperank/engine";


type DEFAULT_STORAGE_CONFIG = s3Config
const DEFAULT_STORAGE_PROCESSOR = s3Processor
const DEFAULT_PROTOCOL_FACTORIES = [NostrProtocolFactory]


// GrapeRank class has static properties and methods 
// to manage and persist GrapeRankEngine instances across client sessions
export class GrapeRank {
  private static _instances : Map<userId, GrapeRankEngine> = new Map()
  
  static init( 
    observer : userId,  
    storage : StorageProcessor | DEFAULT_STORAGE_CONFIG, 
    protocolfactories? : ProtocolFactory[]
  ) : GrapeRankEngine {
    console.log("GrapeRank : initializing engine for : ", observer)
    let instance = this._instances.get(observer)
    if(!instance) {
      // set storage processor from input
      storage = this.getStorage(storage) as StorageProcessor
      // set protocols from input, overriding default nostr protocols if provided
      const protocols = new Protocols([ ...DEFAULT_PROTOCOL_FACTORIES, ...protocolfactories ])
      // add new instance of GrapeRankEngine
      instance = new GrapeRankEngine(observer, storage, protocols)
      this._instances.set(observer, instance)
    }
    return instance
  }

  static async observers(storage : StorageProcessor | DEFAULT_STORAGE_CONFIG) : Promise<string[]> {
    storage = this.getStorage(storage) as StorageProcessor
    return (await storage.observers.list()).list
  }

  static getStorage(storage : StorageProcessor | DEFAULT_STORAGE_CONFIG) : StorageProcessor {
    if(storage instanceof StorageProcessor) return storage
    return new DEFAULT_STORAGE_PROCESSOR(storage)
  }
}

