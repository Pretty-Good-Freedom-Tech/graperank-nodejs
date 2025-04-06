import { oneorzero, ProtocolFactory, ProtocolParams } from "@graperank/util/types";
import { applyRatingsByTag, NostrProtocol, validateEachEventHasAuthor } from "./classes";


export const NostrProtocolFactory : ProtocolFactory = new Map()

NostrProtocolFactory.set('nostr-follows', () => new NostrProtocol<FollowsParams>(
  {
    kinds: [3],
    params : {
      score : 1,
      confidence : .5
    },
    validate : validateEachEventHasAuthor,
    interpret : (instance : NostrProtocol<FollowsParams>, fetchedIndex : number) => {
      return applyRatingsByTag(instance, fetchedIndex)
    }
  }
))
interface FollowsParams extends ProtocolParams {}


NostrProtocolFactory.set('nostr-mutes', () => new NostrProtocol<MutesParams>(
  {
    kinds : [10000],
    params : {
      score : 0,
      confidence : .5
    },
    interpret : (instance : NostrProtocol<MutesParams>, fetchedIndex? : number) => {
      return applyRatingsByTag(instance, fetchedIndex)
    }
  }
))
interface MutesParams extends ProtocolParams {}


NostrProtocolFactory.set('nostr-reports', () => new NostrProtocol<ReportsParams>(
  {
    kinds : [1984],
    params : {
      score : 0,
      confidence : .5,
      nudity : 0, // depictions of nudity, porn, etc.
      malware : 0, // virus, trojan horse, worm, robot, spyware, adware, back door, ransomware, rootkit, kidnapper, etc.
      profanity : 0, // profanity, hateful speech, etc.
      illegal : 0, // something which may be illegal in some jurisdiction
      spam : 0, // spam
      impersonation : 0, // someone pretending to be someone else
      other : 0, // for reports that don't fit in the above categories
    },
    interpret : (instance : NostrProtocol<ReportsParams>, fetchedIndex? : number) => {
      return applyRatingsByTag(instance, fetchedIndex, 'p', 1, 2)
    }
  }
))
interface ReportsParams extends ProtocolParams {
  confidence : number,
  nudity : oneorzero, // depictions of nudity, porn, etc.
  malware : oneorzero, // virus, trojan horse, worm, robot, spyware, adware, back door, ransomware, rootkit, kidnapper, etc.
  profanity : oneorzero, // profanity, hateful speech, etc.
  illegal : oneorzero, // something which may be illegal in some jurisdiction
  spam : oneorzero, // spam
  impersonation : oneorzero, // someone pretending to be someone else
  other : oneorzero, // for reports that don't fit in the above categories
}
