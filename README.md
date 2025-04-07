# GrapeRank

> **A sovereignty-respecting recommendation engine, powered by Webs of Trust and grapes**

GrapeRank (WIP) is an extensive library for Nostr developers to provide 'people' or 'content' recomendations for end-users. It may be embedded within a client as a server side component OR used as a stand alone 'NIP-accessible' recommendation engine by any service provider. 

Explore the demo client at [My Grapevine](https://grapevine.my) get a taste of how it works.


## Webs of Trust

> Sovereignty is respected when users have the freedom to choose ... and a variety of useful choices.

Not everyone wants or needs algorithms to provide them with recommendations. However, the more Nostr scales (to global influence), the more clients and service providers will leverage automated tools for users to 'discover' new and interesting 'people' and 'content' across the network.

On Nostr, there's no central 'trust authority'. Weeding out 'bots and bad actors' and providing useful recommendations is not so straightforward. Even 'crowd-sourced' content moderation, at its core, requires some ability to differentiate 'trustworthy' opinions from spam.

'Webs of Trust' solve this problem without requiring a central authority. They work by defining 'trustworthiness' relative to the end user, based on their own content and interactions (likes, follows, mutes, etc...). In this manner, sovereignty is respected when end users have the freedom to choose their own (favorite) recommendation service for any client, from a wide variety of practical choices.


## The GrapeRank Engine

- **Avoids** the 'popularity contest' that favors influencers, by ranking ALL users on a capped 'weighted average' scale.
- **Accepts** any 'kind' of content (follows, likes, mutes, etc...) for calculating scores.
- **Accepts** any 'source' of content (not JUST Nostr) for calculating scores.
- **Allows** any 'context' to be used for calculating 'trustworthiness' in different cases. (not JUST Web of Trust)
- **Allows** running 'asynchronous' calculations on the server, pushing status notifications to connected clients.
- **Accepts** any 'storage' backend to be plugged in, for easy integration with existing infrastructure.
- **Accepts** multiple 'outputs' to be plugged in (coming soon) to satisfy for any 'nostr NIP' specifications.


### Interpreter 

> Q : *"But what **inputs** does GrapeRank use to generate someone's web of trust?"*

> A : *"Whatever 'inputs' you want ... and for any 'context' you need"*.

The GrapeRank `Interpreter` ingests and normalizes ANY content to user-configurable standard `ratings`, valued from 0-1. It has a modular architecture by which developers can add additional `protocols` for interpreting ANY content from ANY network.

Here's an overview of the interpreter protocols for the *default* 'Web of Trust' context :

- `nostr-follows` : scans for 'follow lists' one degree at a time, for six degrees out = 1
- `nostr-mutes` : scans for 'mute' events from all users returned by 'nostr-follows' = 0
- `nostr-reports` : scans for 'report' events, assigning a value based on report type = 0


### Calculator 

The `Calculator` algorithm at the heart of GrapeRank, iteratively processes content interpretations to determine a final `influence score` for every rated user. IMPORTANTLY, the score that it generates is a 'weighted average', with a fixed ceiling. This prevents 'high follow count' influencers from overwhelming the top scores, allowing 'regular users' to shine just as much, while also keeping 'bots and bad actors' at the bottom. Of course, the calculator also has configurable parameters, allowing end-users to tweak the final score distribution.


### Storage

The `Storage` module allows calculator results to be stored in any kind of database, flat file, or cloud storage architecture. Currently, `s3` storage APIs are supported. 

### Cache (coming soon) 

Let's face it ... scraping Nostr for a MILLION events to interpret EVERY time GrapeRank runs is NOT very 'efficient'. But that is the current state of technology... 

Coming soon, the `Interpreter` module will provide a cache for any `protocol` to store and retrieve its interpretable content. This will NOT ONLY allow for less demand on the network, but will ALSO improve the fidelity of generated results.

### Output (coming soon)

Even though 'recommendations-as-a-service' are a relatively new concept for Nostr, there are already a number of `NIP` standards by which such a service could `Output` signed events. 

Stay tuned for the following ...

- [`NIP-51`](https://github.com/nostr-protocol/nips/blob/master/51.md) 
          : Dynamic lists for custom feeds and other stuff
- [`NIP-90`](https://github.com/nostr-protocol/nips/blob/master/90.md)
          : Respond to DVM marketplace requests
- [`NIP-85`](https://github.com/nostr-protocol/nips/pull/1534) 
          : Provide 'trusted assertions' for users who 'opt in'
- `NIP-XX` : Dynamic whitelist for private relays?


## Usage 
See the API endpoints in the [demo codebase](https://github.com/Pretty-Good-Freedom-Tech/grapevine-client/tree/main/src/routes/api) for a working example.


```
# add module to your typescript project
npm install https://github.com/Pretty-Good-Freedom-Tech/graperank-nodejs 
```

``` js
// initialize (or retrieve existing) graperank engine in your server code
// with pubkey of 'observer' and configuration for storage 
let engine = GrapeRank.init( pubkey, storage )


// recieve notifications during generate() and push to a client
engine.listen( sessionid, callback )


// generate a new batch of scorecards 
// with a new context (string) and settings for calculator and interpreter
engine.generate( context, settings )


// retrieve generated scorecards
engine.scorecards( context )
```


---
---
GrapeRank Engine Developed by : [ManiMe@nostrmeet.me](https://njump.me/npub1manlnflyzyjhgh970t8mmngrdytcp3jrmaa66u846ggg7t20cgqqvyn9tn)

GrapeRank Algorithm Designed by : [David@bitcoinpark.com](https://njump.me/npub1u5njm6g5h5cpw4wy8xugu62e5s7f6fnysv0sj0z3a8rengt2zqhsxrldq3)
