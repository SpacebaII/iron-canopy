/* Iron Canopy — the enemy's war plan for the homeland map (brief 76). Batteries are their launchers on the map; waves
   are the raids, in order, then the loop until the war ends. The war planner in the Sandbox (brief 77) edits it and
   exports this file. See warplan.js for every field. */
(function (IC) {
'use strict';
IC.WAR_PLANS = IC.WAR_PLANS || {};
IC.WAR_PLANS.homeland = {
  "name": "Operation Iron Gate",
  "batteries": [
    {"id":"dr_senitz","name":"Senitz drone battalion","w":"owa","x":25500,"y":10150,"n":4,"salvo":6,"stock":160},
    {"id":"dr_salik","name":"Salik drone battalion","w":"owa","x":33700,"y":10300,"n":4,"salvo":6,"stock":160},
    {"id":"jd_salik","name":"Salik jet drone flight","w":"jdr","x":33500,"y":10050,"n":2,"salvo":3,"stock":30},
    {"id":"cm30","name":"Cruise Missile Brigade 30","w":"lacm","x":23500,"y":6000,"n":4,"salvo":2,"stock":60},
    {"id":"cm30m","name":"Brigade 30, manoeuvring missile battery","w":"mcm","x":23900,"y":6300,"n":2,"salvo":2,"stock":20},
    {"id":"mb2a","name":"Missile Brigade 2, west battery","w":"srbm","x":28400,"y":9200,"n":4,"salvo":2,"stock":40,"replace":36},
    {"id":"mb2b","name":"Missile Brigade 2, east battery","w":"srbm","x":30600,"y":9300,"n":3,"salvo":2,"stock":30,"replace":36},
    {"id":"smb","name":"Strategic Missile Base","w":"mrbm","x":31000,"y":1500,"n":2,"salvo":1,"stock":6},
    {"id":"hgv","name":"Hypersonic Test Range","w":"hgv","x":34000,"y":2800,"n":1,"salvo":1,"stock":2},
    {"id":"ra58","name":"Rocket Artillery Battalion 58","w":"rkt","x":26100,"y":10700,"n":2,"salvo":12,"stock":120},
    {"id":"ra77","name":"Rocket Artillery Battalion 77","w":"rkt","x":33900,"y":11250,"n":2,"salvo":12,"stock":120},
    {"id":"eldan_str","name":"Eldan strike squadron","w":"str","x":31500,"y":7900,"n":4},
    {"id":"eldan_sead","name":"Eldan radar-hunting flight","w":"sead","x":31600,"y":7800,"n":2},
    {"id":"eldan_ewj","name":"Eldan jammer","w":"ewj","x":31400,"y":7800,"n":1},
    {"id":"eldan_bmr","name":"Eldan bomber squadron","w":"bmr","x":31700,"y":7700,"n":2},
    {"id":"lorrow_dcy","name":"Lorrow decoy flight","w":"dcy","x":17000,"y":9300,"n":3,"salvo":4,"stock":48},
    {"id":"lorrow_str","name":"Lorrow strike squadron","w":"str","x":17100,"y":9200,"n":2},
    {"id":"sam_senitz","name":"Senitz air defence","w":"sam","x":25900,"y":10000,"n":2,"R":600},
    {"id":"sam_mb2","name":"Missile Brigade 2 air defence","w":"sam","x":29400,"y":9300,"n":3,"R":1100},
    {"id":"sam_eldan","name":"Eldan air defence","w":"sam","x":31000,"y":8300,"n":3,"R":700},
    {"id":"sam_salik","name":"Salik air defence","w":"sam","x":33800,"y":10200,"n":2,"R":600},
    {"id":"sam_corgrad","name":"Corgrad air defence","w":"sam","x":24000,"y":6400,"n":3,"R":700},
    {"id":"dr_nersk","name":"Tessk drone regiment","w":"owa","x":46000,"y":27800,"n":3,"salvo":6,"stock":90},
    {"id":"cm56","name":"Tessk Missile Regiment 56","w":"lacm","x":50500,"y":28500,"n":2,"salvo":2,"stock":24},
    {"id":"sam_ivra","name":"Ivra air defence","w":"sam","x":47000,"y":28500,"n":2,"R":800}
  ],
  "waves": [
    {"id":"w1","name":"opening strike","when":{"war":0.5},"act":1,"warn":40,
      "intel":"Launch preparations across the border: drones at Senitz, cruise missiles moving at Brigade 30. They will try to see what fires.",
      "say":[{"who":"VOLKAN","text":"(intercepted) All batteries: first wave on my mark. Find their radars. Light up the north and see who answers."}],
      "hits":[
        {"bat":"dr_senitz","n":6,"at":"ad:radar","alt":["base:main"],"t":-300},
        {"bat":"cm30","n":3,"at":"infra:Ashford Power Station","alt":["set:city"],"t":0},
        {"bat":"ra58","n":12,"at":"city:Hollin","t":-120,"p":0.8}
      ]},
    {"id":"w2","name":"strike on the forward base","when":{"after":"w1","h":[3,4]},"night":true,
      "intel":"Missile Brigade 2's launchers have left their garrison. Something is coming for Fort Ashby.",
      "hits":[
        {"bat":"lorrow_dcy","n":4,"at":"base:main","t":-420},
        {"bat":"dr_salik","n":8,"at":"base:main","t":-300},
        {"bat":"mb2a","n":4,"at":"base:main","t":0},
        {"bat":"cm30","n":4,"at":"apt:north","alt":["city:Fort Ashby"],"t":60}
      ]},
    {"id":"w3","name":"strike on our supply","when":{"after":"w2","h":[3,5]},
      "hits":[
        {"bat":"dr_senitz","n":6,"at":"set:fuel","alt":["base:main"],"t":-300},
        {"bat":"cm30","n":4,"at":"set:transport","alt":["infra:Fort Ashby Arms Works"],"t":0},
        {"bat":"ra77","n":12,"at":"ad:sam","alt":["base:main"],"t":-60,"p":0.7}
      ]},
    {"id":"w4","name":"strike on the airports","when":{"after":"w3","h":[3,4]},"act":2,"warn":60,
      "intel":"Their strike squadron at Eldan is fuelled and armed. The airports are next.",
      "say":[{"who":"VOLKAN","text":"(intercepted) Their airlines are their pride. Close the airports and the country stops."}],
      "hits":[
        {"bat":"dr_salik","n":8,"at":"base:main","t":-600},
        {"bat":"jd_salik","n":3,"at":"apt:north","t":-120},
        {"bat":"mb2a","n":4,"at":"apt:capital","t":0},
        {"bat":"mb2b","n":4,"at":"apt:busiest","t":0},
        {"bat":"cm30m","n":2,"at":"apt:capital","t":30},
        {"bat":"eldan_str","n":2,"at":"apt:north","t":120},
        {"bat":"eldan_ewj","n":1,"at":"apt:north","t":0}
      ]},
    {"id":"w5","name":"strike on our radars","when":{"after":"w4","h":[3,4]},
      "hits":[
        {"bat":"eldan_sead","n":2,"at":"ad:radar","t":0},
        {"bat":"lorrow_dcy","n":6,"at":"ad:sam","t":-300},
        {"bat":"dr_senitz","n":8,"at":"ad:sam","t":-200},
        {"bat":"cm30","n":4,"at":"ad:busiest","t":60}
      ]},
    {"id":"w6","name":"major strike","when":{"after":"w5","h":[5,7]},"act":3,"night":true,"warn":90,
      "intel":"Something very large, bigger than anything so far: every launcher in Missile Brigade 2 is out of its shelters, and the Strategic Missile Base is fuelling.",
      "say":[{"who":"VOLKAN","text":"(intercepted) Everything, at once. Their government quarter, their power, their dam. Let them see the sky fall."}],
      "hits":[
        {"bat":"dr_salik","n":10,"at":"base:main","t":-900},
        {"bat":"dr_senitz","n":10,"at":"city:Fort Ashby","t":-600},
        {"bat":"lorrow_dcy","n":8,"at":"command:capital","t":-500},
        {"bat":"jd_salik","n":3,"at":"ad:sam","t":-200},
        {"bat":"mb2a","n":8,"at":"command:capital","t":0},
        {"bat":"mb2b","n":6,"at":"infra:Ashford Power Station","t":0},
        {"bat":"smb","n":2,"at":"city:Ashford","t":20},
        {"bat":"cm30","n":6,"at":"place:dam","t":0},
        {"bat":"cm30m","n":4,"at":"apt:capital","t":30},
        {"bat":"cm56","n":4,"at":"city:Gatlin","t":0},
        {"bat":"eldan_ewj","n":1,"at":"command:capital","t":0}
      ]},
    {"id":"w7","name":"strike on our radars","when":{"after":"w6","h":[6,8]},"act":4,
      "intel":"After the lull: jammers and radar-hunting aircraft at forward fields. They are coming for our eyes.",
      "hits":[
        {"bat":"eldan_ewj","n":1,"at":"ad:radar","t":0},
        {"bat":"eldan_sead","n":2,"at":"ad:radar","t":0},
        {"bat":"lorrow_dcy","n":6,"at":"ad:sam","t":-240},
        {"bat":"dr_senitz","n":8,"at":"ad:radar","t":-200},
        {"bat":"cm30","n":4,"at":"ad:busiest","t":60},
        {"bat":"mb2b","n":2,"at":"ad:busiest","t":60}
      ]},
    {"id":"w8","name":"saturation raid","when":{"after":"w7","h":[3,4]},"loop":true,
      "hits":[
        {"bat":"dr_salik","n":8,"at":"ad:busiest","t":-300},
        {"bat":"lorrow_dcy","n":6,"at":"ad:busiest","t":-300},
        {"bat":"cm30","n":6,"at":"ad:busiest","t":360},
        {"bat":"mb2a","n":4,"at":"ad:busiest","t":360}
      ]},
    {"id":"w9","name":"strike on our supply","when":{"after":"w8","h":[3,4]},"loop":true,
      "hits":[
        {"bat":"dr_senitz","n":6,"at":"set:transport","t":-300},
        {"bat":"cm30","n":4,"at":"set:transport","t":0},
        {"bat":"ra58","n":12,"at":"ad:sam","alt":["city:Hollin"],"t":0,"p":0.6},
        {"bat":"dr_salik","n":6,"at":"set:fuel","t":-200}
      ]},
    {"id":"w10","name":"strike on the air base","when":{"after":"w9","h":[3,4]},"loop":true,
      "hits":[
        {"bat":"lorrow_dcy","n":6,"at":"base:main","t":-420},
        {"bat":"dr_salik","n":8,"at":"base:main","t":-360},
        {"bat":"mb2a","n":4,"at":"base:main","t":0},
        {"bat":"mb2b","n":4,"at":"base:main","t":0},
        {"bat":"eldan_str","n":2,"at":"base:main","t":0},
        {"bat":"lorrow_str","n":2,"at":"base:main","t":30},
        {"bat":"hgv","n":1,"at":"base:main","t":0},
        {"bat":"eldan_bmr","n":1,"at":"apt:busiest","t":0}
      ]},
    {"id":"w11","name":"combined raid","when":{"after":"w10","h":[3,4]},"loop":true,
      "hits":[
        {"bat":"dr_salik","n":6,"at":"set:city","t":-360},
        {"bat":"cm30","n":4,"at":"set:city","t":0},
        {"bat":"cm56","n":2,"at":"city:Gatlin","t":0},
        {"bat":"dr_nersk","n":6,"at":"city:Halloway","t":-300},
        {"bat":"mb2b","n":2,"at":"set:trade","t":0}
      ]},
    {"id":"wr","name":"retaliation strike","retaliation":true,"gap":[1,1.5],
      "intel":"They have sworn retaliation for our strikes on their soil.",
      "say":[{"who":"KOLAR","text":"(their state television) For every bomb on our soil, ten on theirs. The Federation answers."}],
      "hits":[
        {"bat":"mb2b","n":4,"at":"city:Fort Ashby","t":0},
        {"bat":"cm30","n":4,"at":"apt:busiest","alt":["set:city"],"t":0},
        {"bat":"dr_senitz","n":6,"at":"city:Hollin","t":-300}
      ]}
  ]
};
})(window.IC);
