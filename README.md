# GrapeRank

> **A soveregnty respecting reccomedation engine for Nostr, powered by Webs of Trust and grapes**

GrapeRank (WIP) is an modular and extensible server side library for developers to provide 'people' or 'content' reccomendations for their end users. It may be embedded within a relay, or used as a client backend, or a stand alone DVM, allowing any service provider to offer 'NIP standard' reccomendations across clients.

Explore the demo client at [My Grapevine](https://grapevine.my) get a taste of how it works.


## Webs of Trust

> Soveregnty is respected when users have the freedom to choose ... and a variety of usefull choices.

Not everyone wants or needs algorithms to provide them with reccomendations. However, the more Nostr scales (to global influence) the more clients and service providers will leverage automated tools for users to 'discover' new and interesting 'people' and 'content' across the network.

On Nostr, there's no central 'trust authotity'. Weeding out 'bots and bad actors' and providing usefull reccomendations is not so straighforward. Even 'crowd sourced' content moderation, at its core, requires some ability to differentiate 'trustworthy' opinions from spam.

'Webs of Trust' solves this problem without requiring a central authority. It works by defining 'trustworthiness' relative to the end user, based on their own content and interactions (likes, follows, mutes, ect...). In this manner, soveregnty is respected when end users have the freedom to choose their own (favorite) reccomendation service for any client, from a wide variety of practical choices.


## The GrapeRank Engine

- **Avoids** the 'popularity contest' that favors influencers, by ranking ALL users on a capped 'weighted average' scale.
- **Accepts** any 'kind' of content (follows, likes, mutes, ect...) for calculating scores 
- **Accepts** any 'source' of content (not JUST nostr) for calculating scores
- **Allows** any 'context' to be used for calculating 'trustowrthiness' in diferent cases. (not JUST web of trust)
- **Allows** running 'asyncronos' calculations on the server, pushing status notifications to connected cleints.
- **Accepts** any 'storage' backend to be plugged in, for easy integration with existing infrastructure.
- **Accepts** multiple 'outputs' to be plugged in (comming soon) to satisfy for any 'nostr nip' specifications.


### Interpreter 

> Q : *"But what **inputs** does GrapeRank use to generate someone's web of trust?"*

> A : *"Whatever 'inputs' you want ... and for any 'context' you need"*.

The GrapeRank `Interpreter` ingests and normalizes ANY content to user configurable standard `ratings`, valued from 0-1. It has a pluggable architecture by which developers can add additional `protocols` for interpreting ANY content from ANY network.

Here's an overview of the interpreter protocols for the *default* 'Web of Trust' context :

- `nostr-follows` : scans for 'follow lists' one degree at a time, for six degrees out = 1
- `nostr-mutes` : scans for 'mute' events from all users returned by 'nostr-follows' = 0
- `nostr-reports` : scans for 'report' events, assigning a value based on report type = 0


### Calculator 

The `Calculator` algorithm at the heart of GrapeRank, iteratively processes content interpretations to determine a final `influence score` for every rated user. IMPORTANTLY, the score that it generates is a 'weighted average', with a fixed ceiling. This prevents 'high follow count' influencers from overwhelming the top scores, allowing 'regular users' to shine just as much, while also keeping 'bots and bad actors' at the bottom. Of course, the calculator also has configurable parameters, allowing end users to tweak the final score distribution.


### Storage

The pluggable `Storage` module allows calculator results to be stored in any kind of database, flat file, or cloud storage architecture. Currently, `s3` storage APIs are supported. 

### Cache (coming soon) 

Lte's face it ... scraping Nostr for a MILLION events to interpret EVERY time GrapeRank runs is NOT very 'efficient'. But that is the current state of technology... 

Coming soon, the `Interpreter` module will provide a cache for any `protocol` to store and retrieve it's interpretable content. This will NOT ONLY allow for less demand on the network BUT WILL ALSO improve the fidelity of generated results.

### Output (coming soon)

Even though 'reccomendations as a service' are a relatively new concept for Nostr, there are already a number of `NIP` standards for which such a service could `Output` signed events. Stay tuned for the following ...

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
# add GrapeRank to your typescript project
npm install @graperank/graperank
```

``` js
// initialize (or retrieve existing) graperank engine in your server code
// with pubkey of 'observer' and configuration for s3 storage 
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
GrapeRank Developed by : [ManiMe@nostrmeet.me](https://njump.me/npub1manlnflyzyjhgh970t8mmngrdytcp3jrmaa66u846ggg7t20cgqqvyn9tn)

Algorithm Designed by : [David@bitcoinpark.com](https://njump.me/npub1u5njm6g5h5cpw4wy8xugu62e5s7f6fnysv0sj0z3a8rengt2zqhsxrldq3)