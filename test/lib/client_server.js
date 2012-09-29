var Client = require('../../lib/client');
var Server = require('../../lib/server');
var h = require('./helpers');

function inherit (Const, Super) {
  function F () {}
  F.prototype = Super.prototype;
  Const.prototype = new F();
  Const.prototype.constructor = Const;
}


function MyServer (document, broadcast) {
  Server.call(this, document);
  this.broadcast = broadcast;
}

inherit(MyServer, Server);


function MyClient (document, revision, channel) {
  Client.call(this, revision);
  this.document = document;
  this.channel = channel;
}

inherit(MyClient, Client);

MyClient.prototype.sendOperation = function (operation) {
  this.channel.write(operation);
};

MyClient.prototype.applyOperation = function (operation) {
  this.document = operation.apply(this.document);
};

MyClient.prototype.performOperation = function () {
  var operation = h.randomOperation(this.createOperation(), this.document);
  this.document = operation.apply(this.document);
  this.applyClient(operation);
};


function NetworkChannel (onReceive) {
  this.buffer = [];
  this.onReceive = onReceive;
}

NetworkChannel.prototype.isEmpty = function () {
  return this.buffer.length === 0;
};

NetworkChannel.prototype.write = function (val) {
  this.buffer.push(val);
};

NetworkChannel.prototype.read = function () {
  return this.buffer.shift();
};

NetworkChannel.prototype.receive = function () {
  this.onReceive.call(null, this.read());
};


function testClientServerInteraction () {
  var document = h.randomString();
  var server = new MyServer(document, function (operation) {
    client1ReceiveChannel.write(operation);
    client2ReceiveChannel.write(operation);
  });
  var client1SendChannel = new NetworkChannel(function (o) { server.receiveOperation(o); });
  var client1ReceiveChannel = new NetworkChannel(function (o) { client1.applyServer(o); });
  var client1 = new MyClient(document, 0, client1SendChannel);
  var client2SendChannel = new NetworkChannel(function (o) { server.receiveOperation(o); });
  var client2ReceiveChannel = new NetworkChannel(function (o) { client2.applyServer(o); });
  var client2 = new MyClient(document, 0, client2SendChannel);
  var channels = [client1SendChannel, client1ReceiveChannel, client2SendChannel, client2ReceiveChannel];

  function canReceive () {
    for (var i = 0; i < channels.length; i++) {
      if (!channels[i].isEmpty()) { return true; }
    }
    return false;
  }

  function receiveRandom () {
    var channel = h.randomElement(channels.filter(function (c) {
      return !c.isEmpty();
    }));
    channel.receive();
  }

  var n = 50;
  while (n--) {
    if (!canReceive() || Math.random() < 0.75) {
      var client = Math.random() < 0.5 ? client1 : client2;
      client.performOperation();
    } else {
      receiveRandom();
    }
  }

  while (canReceive()) {
    receiveRandom();
  }

  h.assertEqual(server.document, client1.document);
  h.assertEqual(client1.document, client2.document);
}

exports.run = function () {
  var n = 25;
  for (var i = 0; i < n; i++) {
    testClientServerInteraction();
  }
};