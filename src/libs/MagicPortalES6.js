var e=function(e){var t=this;this.rpc_counter=0,this.channel=e,this.foreign=new Map,this.local=new Map,this.calls=new Map,this.queue=[],this.connectionEstablished=!1,this.channel.addEventListener("message",function(e){var n=e.data;if(n&&"object"==typeof n)switch(n.type){case"MP_INIT":return t.onInit(n);case"MP_SET":return t.onSet(n);case"MP_CALL":return t.onCall(n);case"MP_RETURN":return t.onReturn(n)}}),this.channel.postMessage({type:"MP_INIT",id:1,reply:!0})};e.prototype.onInit=function(e){this.connectionEstablished=!0;var t=this.queue;this.queue=[];for(var n=0,o=t;n<o.length;n+=1){this.channel.postMessage(o[n])}e.reply&&this.channel.postMessage({type:"MP_INIT",reply:!1})},e.prototype.onSet=function(e){for(var t=this,n={},o=e.object,s=function(){var s=i[r],c=!e.void.includes(s);n[s]=function(){for(var e=[],n=arguments.length;n--;)e[n]=arguments[n];return t.rpc_counter=(t.rpc_counter+1)%Number.MAX_SAFE_INTEGER,new Promise(function(n,r){t.postMessage({type:"MP_CALL",object:o,method:s,id:t.rpc_counter,args:e,reply:c}),c?t.calls.set(t.rpc_counter,{resolve:n,reject:r}):n()})}},r=0,i=e.methods;r<i.length;r+=1)s();var c=this.foreign.get(e.object);this.foreign.set(e.object,n),"function"==typeof c&&c(n)},e.prototype.onCall=function(e){var t=this,n=this.local.get(e.object);n&&n[e.method].apply(n,e.args).then(function(n){return e.reply&&t.channel.postMessage({type:"MP_RETURN",id:e.id,result:n})}).catch(function(n){return t.channel.postMessage({type:"MP_RETURN",id:e.id,error:n.message})})},e.prototype.onReturn=function(e){if(this.calls.has(e.id)){var t=this.calls.get(e.id),n=t.resolve,o=t.reject;this.calls.clear(e.id),e.error?o(e.error):n(e.result)}},e.prototype.postMessage=function(e){this.connectionEstablished?this.channel.postMessage(e):this.queue.push(e)},e.prototype.set=function(e,t,n){void 0===n&&(n={}),this.local.set(e,t);var o=Object.entries(t).filter(function(e){return"function"==typeof e[1]}).map(function(e){return e[0]});this.postMessage({type:"MP_SET",object:e,methods:o,void:n.void||[]})},e.prototype.get=function(e){return new Promise(function(t,n){var o=this;return this.foreign.has(e)?t(this.foreign.get(e)):t(new Promise(function(t,n){return o.foreign.set(e,t)}))}.bind(this))};export default function(t){var n=new e(t);Object.defineProperties(this,{get:{writable:!1,configurable:!1,value:n.get.bind(n)},set:{writable:!1,configurable:!1,value:n.set.bind(n)}})}
//# sourceMappingURL=MagicPortalES6.js.map