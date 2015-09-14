/*
 * Copyright (c) 2015 Internet of Protocols Alliance (IOPA)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// DEPENDENCIES
const net = require('net'),
  util = require('util'),
  events = require('events'),
  dgram = require('dgram'),

  iopaStream = require('iopa-common-stream'),
  iopaContextFactory = require('iopa').factory,
  constants = require('iopa').constants,
  IOPA = constants.IOPA,
  SERVER = constants.SERVER


/* *********************************************************
 * IOPA UDP CLIENT (GENERIC)  
 * ********************************************************* */

 /**
 * Creates a new IOPA Request using a UDP Url including host and port name
 *
 * @method UdpClient

 * @parm {object} options not used
 * @parm {string} urlStr url representation of ://127.0.0.1:8200
 * @public
 * @constructor
 */
function UdpClient(options) { 
   events.EventEmitter.call(this);
  
  this._options = options || {}; 
  this._connections = {};
  }

util.inherits(UdpClient, events.EventEmitter);

/**
 * Creates a new IOPA Request using a UDP Url including host and port name
 *
 * @method connect

 * @parm {object} options not used
 * @parm {string} urlStr url representation of ://127.0.0.1:8200
 * @public
 * @constructor
 */
UdpClient.prototype.connect = function UdpServer_connect(urlStr){
  var channelContext = iopaContextFactory.createRequestResponse(urlStr, "UDP-CONNECT");
  var channelResponse = channelContext.response;
  
  var addressType;
  
  if (net.isIPv6(channelContext[SERVER.RemoteAddress]))
       addressType = 'udp6'
  else
      addressType = 'udp4';
      
  var _udp = dgram.createSocket(addressType);
  channelContext[SERVER.RawTransport] = _udp;
  channelContext[SERVER.OriginalUrl] = urlStr;
  channelContext[SERVER.Fetch] = UdpClient_Fetch.bind(this, channelContext);
  channelContext[SERVER.SessionId] = channelContext[SERVER.LocalAddress] + ":" + channelContext[SERVER.LocalPort] + "-" + channelContext[SERVER.RemoteAddress] + ":" + channelContext[SERVER.RemotePort];
  this._connections[channelContext[SERVER.SessionId]] = channelContext;
             
  channelContext[SERVER.RawStream] = new iopaStream.OutgoingStreamTransform(this._write.bind(this, channelContext));
  channelContext[SERVER.RawStream].on('finish', this._disconnect.bind(this, channelContext, null));
 
  channelResponse[SERVER.RawStream] = new iopaStream.IncomingMessageStream();
  channelResponse[SERVER.RawTransport] = this._udp;
 
  _udp.on("error", this._disconnect.bind(this, channelContext) );
  
  _udp.on("message", function (msg, rinfo) {
      channelResponse[SERVER.RemoteAddress] = rinfo.address;
      channelResponse[SERVER.RemotePort] = rinfo.port;
      channelResponse[SERVER.RawStream].append(msg);
    });
   
  return new Promise(function(resolve, reject){
           _udp.bind(0, null, function(){
              var _linfo = _udp.address();
              channelContext[SERVER.LocalPort] = _linfo.port;
              channelContext[SERVER.LocalAddress] = _linfo.address;
              channelResponse[SERVER.LocalAddress] = channelContext[SERVER.LocalAddress];
              channelResponse[SERVER.LocalPort] = channelContext[SERVER.LocalPort];
              resolve(channelContext);
           });
     });
 };
 
UdpClient.prototype._write = function UdpServer_write(channelContext, chunk, encoding, done) { 
  if (typeof chunk === "string" || chunk instanceof String) {
              chunk = new Buffer(chunk, encoding);
          }
  
   channelContext[SERVER.RawTransport].send(chunk, 0, chunk.length,  channelContext[SERVER.RemotePort], channelContext[SERVER.RemoteAddress], done );
 }
 
 /**
 * Fetches a new IOPA Request using a UDP Url including host and port name
 *
 * @method fetch

 * @param path string representation of ://127.0.0.1/hello
 * @param options object dictionary to override defaults
 * @param pipeline function(context):Promise  to call with context record
 * @returns Promise<null>
 * @public
 */
function UdpClient_Fetch(channelContext, path, options, pipeline) {
  if (typeof options === 'function') {
    pipeline = options;
    options = {};
  }
  
  pipeline = pipeline || function(){return Promise.resolve(null);};
  
  var channelResponse = channelContext.response;

  var urlStr = channelContext[SERVER.OriginalUrl] + path;
  var context = iopaContextFactory.createRequestResponse(urlStr, options);

  context[SERVER.LocalAddress] = channelContext[SERVER.LocalAddress];
  context[SERVER.LocalPort] = channelContext[SERVER.LocalPort];
  context[SERVER.RawStream] = channelContext[SERVER.RawStream];
  context[SERVER.SessionId] = channelContext[SERVER.SessionId];
  context[SERVER.ParentContext] = channelContext;
 
  var response = context.response;
  response[SERVER.LocalAddress] = channelResponse[SERVER.LocalAddress];
  response[SERVER.LocalPort] = channelResponse[SERVER.LocalPort];
  response[SERVER.RawStream] = channelResponse[SERVER.RawStream];
  response[SERVER.ParentContext] = channelResponse;
     
  return iopaContextFactory.using(context, pipeline);
};

/**
 * @method _disconnect
 * Close the  channel context
 * 
 * @public
 */
UdpClient.prototype._disconnect = function UdpClient_disconnect(channelContext, err) {
  if (channelContext[IOPA.Events]){
         channelContext[IOPA.Events].emit(IOPA.EVENTS.Disconnect);
         channelContext[SERVER.CallCancelledSource].cancel(IOPA.EVENTS.Disconnect);
         delete this._connections[channelContext[SERVER.SessionId]];
         channelContext[SERVER.RawTransport].close();
         iopaContextFactory.dispose(channelContext);
     }
}

/**
 * @method close
 * Close all the underlying sockets
 * 
 * @returns {Promise()}
 * @public
 */
UdpClient.prototype.close = function UdpClient_close() {
   for (var key in this._connections)
      this._disconnect(this._connections[key], null);
  
  this._connections = {};
  
  return Promise.resolve(null);
};


module.exports = UdpClient;