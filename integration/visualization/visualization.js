$(document).ready(function () {
  var Client = ot_client.Client;
  var Server = ot_server.Server;

  // View

  var View = {
    appendTo: function (el) {
      this.el.appendTo(el);
      return this;
    }
  };


  // Visualization

  function Visualization (str) {
    this.str = str;
    this.el = $('<div id="visualization" />');

    var self = this;
    this.server = new MyServer(str).appendTo(this.el);
    this.server.addListener('newOperation', function (operation) {
      self.aliceReceiveChannel.write(operation);
      self.bobReceiveChannel.write(operation);
    });
    this.aliceSendChannel = new NetworkChannel(true, function (o) {
      self.server.receiveOperation(o);
    }).appendTo(this.el);
    this.aliceSendChannel.el.attr({ id: 'alice-send-channel' });
    this.aliceReceiveChannel = new NetworkChannel(false, function (o) {
      self.alice.applyServer(o);
    }).appendTo(this.el);
    this.aliceReceiveChannel.el.attr({ id: 'alice-receive-channel' });
    this.alice = new MyClient("Alice", str, 0, this.aliceSendChannel)
      .appendTo(this.el);
    this.alice.el.attr({ id: 'alice' });
    this.bobSendChannel = new NetworkChannel(true, function (o) {
      self.server.receiveOperation(o);
    }).appendTo(this.el);
    this.bobSendChannel.el.attr({ id: 'bob-send-channel' });
    this.bobReceiveChannel = new NetworkChannel(false, function (o) {
      self.bob.applyServer(o);
    }).appendTo(this.el);
    this.bobReceiveChannel.el.attr({ id: 'bob-receive-channel' });
    this.bob = new MyClient("Bob", str, 0, this.bobSendChannel)
      .appendTo(this.el);
    this.bob.el.attr({ id: 'bob' });
  }

  extend(Visualization.prototype, View);

  Visualization.prototype.appendTo = function (el) {
    View.appendTo.call(this, el);
    this.alice.cm.refresh();
    this.bob.cm.refresh();
    return this;
  };


  // Network channel

  function NetworkChannel (up, onReceive) {
    this.buffer = [];
    this.up = up;
    this.onReceive = onReceive;
    this.el = $('<div class="network-channel"><div /></div>')
      .addClass(up ? 'up-channel' : 'down-channel');
    var that = this;
    var arrow = up ? '&uarr;' : '&darr;';
    this.button = $('<a href="#" class="disabled">' + arrow + '</a>')
      .appendTo(this.el)
      .click(function (e) {
        e.preventDefault();
        if ($(this).hasClass('disabled')) { return; }
        that.receive();
      });
  }

  extend(NetworkChannel.prototype, View);

  NetworkChannel.prototype.write = function (val) {
    if (this.buffer.length === 0) {
      this.button.removeClass('disabled');
    }
    this.buffer.push(val);
  };

  NetworkChannel.prototype.read = function () {
    if (this.buffer.length === 1) {
      this.button.addClass('disabled');
    }
    return this.buffer.shift();
  };

  NetworkChannel.prototype.receive = function () {
    this.onReceive.call(null, this.read());
  };


  // MyServer

  function MyServer (str) {
    Server.call(this, str);
    this.el = $('<div id="server" />');
    $('<h2 />').text("Server").appendTo(this.el);
  }

  inherit(MyServer, Server);
  extend(MyServer.prototype, View);


  // MyClient

  function MyClient (name, str, revision, channel) {
    Client.call(this, revision);
    this.name = name;
    this.channel = channel;
    this.fromServer = false;

    this.oldValue = str;

    var self = this;
    this.el = $('<div class="client" />');
    $('<h2 />').text(name).appendTo(this.el);
    this.stateEl = $('<p />').appendTo(this.el).text("State: Synchronized");
    this.cm = CodeMirror($('<div />').appendTo(this.el).get(0), {
      lineNumbers: true,
      lineWrapping: true,
      value: str,
      onChange: function (cm, change) {
        if (!self.fromServer) {
          var operation = self.createOperation();
          operation = codeMirrorChangeToOperation(operation, cm, change, self.oldValue);
          console.log(change, operation);
          self.applyClient(operation);
        }
        self.oldValue = self.cm.getValue();
      }
    });
  }

  inherit(MyClient, Client);
  extend(MyClient.prototype, View);

  MyClient.prototype.sendOperation = function (operation) {
    this.channel.write(operation);
  };

  MyClient.prototype.applyOperation = function (operation) {
    this.fromServer = true;
    codeMirrorApplyOperation(this.cm, operation);
    this.fromServer = false;
  };

  MyClient.prototype.transitionTo = function () {
    Client.prototype.transitionTo.apply(this, arguments);
    this.stateEl.text("State: " + this.state);
  };


  // Helper functions

  function inherit (Const, Super) {
    function F () {}
    F.prototype = Super.prototype;
    Const.prototype = new F();
    Const.prototype.constructor = Const;
  }

  function extend (target, source) {
    for (var name in source) {
      if (source.hasOwnProperty(name)) {
        target[name] = source[name];
      }
    }
  }


  // Initialize Visualization

  new Visualization("Lorem ipsum").appendTo($('#wrapper'));
});