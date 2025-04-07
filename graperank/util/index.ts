export const DEBUGTARGET = ''

// Ivan@primal.net : DOS = 2?
// export const DEBUGTARGET = '01ddee289b1a2e90874ca3428a7a414764a6cad1abfaa985c201e7aada16d38c'

// mateodelarioja@iris.to : DOS = 3?
// export const DEBUGTARGET = 'aae4c84cad11d11cadb19456daa7bec01fa30125c84b0e2725aeeec6271a1b15'

// neo.metal : DOS = 5?
// export const DEBUGTARGET = 'ae831ad395b98c6c2b8812eecb907c83fda1365e6eff79830eb475fa980bd549'

/**
 * Handle big arrays with care
 * using a promise to wait for setTimeout
 * and using setTimeout to avoid "Maximum call size stack exceeded" error in nodejs
 * https://stackoverflow.com/questions/20936486/node-js-maximum-call-stack-size-exceeded
 */

export async function filterBigArray<T>(bigarray : T[], predicate: (value: T, index: number, array: T[]) => unknown, thisArg? : any, max = 1000) : Promise<T[]>{
  const filtered : T[] = []
  const slices = await sliceBigArray<T>(bigarray, max)
  for(let s in slices){ 
      await new Promise<T[]>( (resolve) => {
        setTimeout( () => { resolve(
          slices[s].filter(predicate,thisArg)
        )}, 0 )
      })
      .then((subset)=> filtered.push(...subset))
      .catch((e)=> console.log('GrapeRank : ERROR processing filterBigArray : ',e))
  }
  return filtered
}

export async function forEachBigArray<T>(bigarray : T[], callbackfn : (value: T, index: number, array: T[]) => void, thisArg? : any, max = 1000) : Promise<void>{
  const slices = await sliceBigArray<T>(bigarray, max)
  for(let s in slices){ 
    await new Promise<void>( (resolve) => {
      setTimeout( () => { resolve(
        slices[s].forEach(callbackfn,thisArg)
      )}, 0 )
    })
  }
  return 
}

export async function mergeBigArrays<T>(array1 : T[], array2 : T[], max = 1000) : Promise<T[]>{
  const merged : T[] = [...array1]
  const slices = await sliceBigArray<T>(array2, max)
  for(let s in slices){ 
  await new Promise<T[]>( (resolve) => {
        setTimeout( () => { 
          resolve(slices[s]) 
        }, 0 )
      })
      .then((subset)=> merged.push(...subset))
      .catch((e)=> console.log('GrapeRank : ERROR processing mergeBigArrays : ',e))
  }
  return merged
}

export async function sliceBigArray<T>(array : T[], max = 1000) : Promise<T[][]>{
  if(array.length <= max ) return [array]
  let sliced : T[][] = []
  let slicestart = 0
  let sliceend = max
  while(slicestart < array.length){
    await new Promise<T[]>( (resolve) => {
      setTimeout( () => { 
        resolve(array.slice(slicestart,sliceend)) 
      }, 0 )
    })
    .then((subset)=> sliced.push(subset))
    .catch((e)=> console.log('GrapeRank : ERROR processing sliceBigArray : ',e))
    slicestart = sliceend
    sliceend = slicestart+max
  }
  return sliced
}


export function scwartzianSortBigArray<T>(tobesorted : T[], sorter : SchwartzianSortFunctions<T>) : T[]{
  // return await new Promise<T[]>( (resolve) => {
  //   setTimeout( () => {
      // sortables array holds objects with index and value of each element
      var sortables = tobesorted.map(sorter.map)
      // sort the sortables array 
      sortables.sort(sorter.compare)
      // copy element back to a new sorted array of elements
      // resolve( sortables.map( sortable => tobesorted[sortable.index] ))
    // }, 0 )
  // })
  return sortables.map( sortable => tobesorted[sortable.index] )
}
export type SchwartzianSortable = { index : number, value : number }
export type SchwartzianSortFunctions<T> = {
  map : (item : T, index : number) => SchwartzianSortable,
  compare : (a: SchwartzianSortable, b: SchwartzianSortable) => number
}



export function mapNested<Index1, Index2, Value>(array : [Index1,[Index2,Value][]][]) :  Map<Index1,Map<Index2,Value>> {
  let map : Map<Index1,Map<Index2,Value>> = new Map()
  for(let i in array){
    map.set(array[i][0], new Map(array[i][1]))
  }
  return map
}
export function unmapNested<Index1, Index2, Value>(map : Map<Index1,Map<Index2,Value>> ) : [Index1,[Index2,Value][]][] {
  let array : [Index1,[Index2,Value][]][] = []
  map.forEach((value,key)=>{
    array.push([key, [...value.entries()]])
  })
  return array
}