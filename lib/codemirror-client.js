ot.CodeMirrorClient = (function () {
  var Client = ot.Client;
  var Operation = ot.Operation;

  function CodeMirrorClient (socket, cm) {
    this.socket = socket;
    this.cm = cm;
    this.fromServer = false;
    this.unredo = false;
    this.undoStack = [];
    this.redoStack = [];
    this.clients = {};
    this.initializeClientList();

    var self = this;
    socket.on('doc', function (obj) {
      Client.call(self, obj.revision);
      self.initializeCodeMirror(obj.str);
      self.initializeSocket();
      self.initializeClients(obj.clients);
    });
  }

  inherit(CodeMirrorClient, Client);

  CodeMirrorClient.prototype.applyClient = function (operation) {
    operation.meta.cursor = this.cursor;
    operation.meta.selectionEnd = this.selectionEnd;
    clearTimeout(this.sendCursorTimeout);
    Client.prototype.applyClient.call(this, operation);
  };

  CodeMirrorClient.prototype.applyServer = function (operation) {
    var isOutstandingOperation = this.outstanding && this.outstanding.id === operation.id;
    Client.prototype.applyServer.call(this, operation);

    if (!isOutstandingOperation) {
      var meta = operation.meta;
      this.updateClientCursor(meta.clientId, meta.cursor, meta.selectionEnd);
      this.transformUnredoStack(this.undoStack, operation);
      this.transformUnredoStack(this.redoStack, operation);
    }
  };

  CodeMirrorClient.prototype.initializeSocket = function () {
    var self = this;

    this.socket
      .on('client_left', function (obj) {
        self.onClientLeft(obj.clientId);
      })
      .on('set_name', function (obj) {
        self.onSetName(obj.clientId, obj.name);
      })
      .on('operation', function (operationObj) {
        var operation = Operation.fromJSON(operationObj);
        console.log("Operation from server by client " + operation.meta.clientId + ":", operation);
        self.applyServer(operation);
      })
      .on('cursor', function (update) {
        self.updateClientCursor(update.clientId, update.cursor, update.selectionEnd);
      });
  };

  CodeMirrorClient.prototype.getClientObject = function (clientId) {
    var client = this.clients[clientId];
    if (client) { return client; }
    client = this.clients[clientId] = { clientId: clientId };
    this.initializeClient(client);
    return client;
  };

  CodeMirrorClient.prototype.onClientLeft = function (clientId) {
    console.log("User disconnected: " + clientId);
    var client = this.clients[clientId];
    if (!client) { return; }
    if (client.li) { removeElement(client.li); }
    if (client.cursorEl) { removeElement(client.cursorEl); }
    if (client.mark) { client.mark.clear(); }
    delete this.clients[clientId];
  };

  CodeMirrorClient.prototype.onSetName = function (clientId, name) {
    var client = this.getClientObject(clientId);
    client.name = name;
    var oldLi = client.li;
    var newLi = client.li = this.createClientListItem(client);
    if (oldLi) {
      this.clientListEl.replaceChild(newLi, oldLi);
    } else {
      this.clientListEl.appendChild(newLi);
    }
  };

  CodeMirrorClient.prototype.initializeCodeMirror = function (str) {
    var cm = this.cm;
    var self = this;

    cm.setValue(str);
    this.oldValue = str;

    var oldOnChange = cm.getOption('onChange');
    cm.setOption('onChange', function (_, change) {
      self.onCodeMirrorChange(change);
      if (oldOnChange) { oldOnChange.call(this, cm, change); }
    });

    var oldOnCursorActivity = cm.getOption('onCursorActivity');
    cm.setOption('onCursorActivity', function (_) {
      self.onCodeMirrorCursorActivity();
      if (oldOnCursorActivity) { oldOnCursorActivity.call(this, cm); }
    });

    cm.undo = function () { self.undo(); };
    cm.redo = function () { self.redo(); };
  };

  CodeMirrorClient.prototype.initializeClients = function (clients) {
    for (var clientId in clients) {
      if (clients.hasOwnProperty(clientId)) {
        var client = clients[clientId];
        console.log(clientId, client);
        client.clientId = clientId;
        this.clients[clientId] = client;
        this.initializeClient(client);
      }
    }
  };

  CodeMirrorClient.prototype.initializeClientList = function () {
    this.clientListEl = document.createElement('ul');
  };

  function rgb2hex (r, g, b) {
    function digits (n) {
      var m = Math.round(255*n).toString(16);
      return m.length === 1 ? '0'+m : m;
    }
    return '#' + digits(r) + digits(g) + digits(b);
  }

  function hsl2hex (h, s, l) {
    if (s === 0) { return rgb2hex(l, l, l); }
    var var2 = l < 0.5 ? l * (1+s) : (l+s) - (s*l);
    var var1 = 2 * l - var2;
    var hue2rgb = function (hue) {
      if (hue < 0) { hue += 1; }
      if (hue > 1) { hue -= 1; }
      if (6*hue < 1) { return var1 + (var2-var1)*6*hue; }
      if (2*hue < 1) { return var2; }
      if (3*hue < 2) { return var1 + (var2-var1)*6*(2/3 - hue); }
      return var1;
    };
    return rgb2hex(hue2rgb(h+1/3), hue2rgb(h), hue2rgb(h-1/3));
  }

  CodeMirrorClient.prototype.initializeClient = function (client) {
    console.log("initializeClient");
    client.hue = Math.random();
    client.color = hsl2hex(client.hue, 0.75, 0.5);
    client.lightColor = hsl2hex(client.hue, 0.5, 0.9);

    if (client.name) {
      client.li = this.createClientListItem(client);
      this.clientListEl.appendChild(client.li);
    }

    this.createClientCursorEl(client);
    this.updateClientCursorElPosition(client);
    this.createClientSelectionStyleRule(client);
    this.updateClientMark(client);
  };

  CodeMirrorClient.prototype.createClientListItem = function (client) {
    var el = document.createElement('li');
    el.style.color = client.color;
    el.appendChild(document.createTextNode(client.name));
    return el;
  };

  function randomInt (n) {
    return Math.floor(Math.random() * n);
  }

  CodeMirrorClient.prototype.createClientSelectionStyleRule = function (client) {
    client.selectionClassName = 'client-selection-' + randomInt(1e6);
    var selector = '.' + client.selectionClassName;
    var styles = 'background:' + client.lightColor + ';';
    var rule = selector + '{' + styles + '}';
    try {
      var styleSheet = document.styleSheets.item(0);
      styleSheet.insertRule(rule, styleSheet.rules.length);
    } catch (exc) {
      console.error("Couldn't add style rule for client selections.", exc);
    }
  };

  function cleanNoops (stack) {
    function isNoop (operation) {
      var ops = operation.ops;
      return ops.length === 0 || (ops.length === 1 && !!ops[0].retain);
    }

    while (stack.length > 0) {
      var operation = stack[stack.length - 1];
      if (isNoop(operation)) {
        stack.pop();
      } else {
        break;
      }
    }
  }

  var UNDO_DEPTH = 20;

  function cursorIndexAfterOperation (operation) {
    // TODO
    var ops = operation.ops;
    if (ops[0].retain) {
      var index = ops[0].retain;
      if (ops[1].insert) {
        return index + ops[1].insert.length;
      } else {
        return index;
      }
    } else if (ops[0].insert) {
      return ops[0].insert.length;
    } else {
      return 0;
    }
  }

  CodeMirrorClient.prototype.unredoHelper = function (sourceStack, targetStack) {
    cleanNoops(sourceStack);
    if (sourceStack.length === 0) { return; }
    var operation = sourceStack.pop();
    operation.revision = this.createOperation().revision;
    targetStack.push(operation.invert());
    this.unredo = true;
    operation.applyToCodeMirror(this.cm);
    this.cursor = this.selectionEnd = cursorIndexAfterOperation(operation);
    this.cm.setCursor(this.cm.posFromIndex(this.cursor));
    this.applyClient(operation);
  };

  CodeMirrorClient.prototype.transformUnredoStack = function (stack, operation) {
    cleanNoops(stack);
    for (var i = stack.length - 1; i >= 0; i--) {
      stack[i].revision = operation.revision;
      var transformedPair = Operation.transform(stack[i], operation);
      stack[i]  = transformedPair[0];
      operation = transformedPair[1];
    }
  };

  CodeMirrorClient.prototype.addOperationToUndo = function (operation) {
    function isSimpleOperation (operation, fn) {
      var ops = operation.ops;
      switch (ops.length) {
        case 0: return true;
        case 1: return !!fn(ops[0]);
        case 2: return !!((ops[0].retain && fn(ops[1])) || (fn(ops[0]) && ops[1].retain));
        case 3: return !!(ops[0].retain && fn(ops[1]) && ops[2].retain);
        default: return false;
      }
    }

    function isSimpleInsert (operation) {
      return isSimpleOperation(operation, function (op) { return op.insert; });
    }

    function isSimpleDelete (operation) {
      return isSimpleOperation(operation, function (op) { return op.delete; });
    }

    function shouldBeComposed (a, b) {
      if (isSimpleInsert(a) && isSimpleInsert(b)) {
        return isSimpleInsert(a.compose(b));
      } else if (isSimpleDelete(a) && isSimpleDelete(b)) {
        var opA = a.ops[0], opsB = b.ops;
        if (!opA.retain) { return false; }
        if (opsB[0].delete) {
          return opA.retain === opsB[0].delete.length;
        } else {
          return opA.retain === opsB[0].retain + opsB[1].delete.length;
        }
      }
      return false;
    }

    if (this.undoStack.length === 0) {
      this.undoStack.push(operation);
    } else {
      var lastOperation = this.undoStack[this.undoStack.length - 1];
      lastOperation.revision = operation.revision + 1;
      if (shouldBeComposed(operation, lastOperation)) {
        var composed = operation.compose(lastOperation);
        this.undoStack[this.undoStack.length - 1] = composed;
      } else {
        this.undoStack.push(operation);
        if (this.undoStack.length > UNDO_DEPTH) {
          this.undoStack.shift();
        }
      }
    }
    if (this.redoStack.length > 0) { this.redoStack = []; }
  };

  CodeMirrorClient.prototype.undo = function () {
    this.unredoHelper(this.undoStack, this.redoStack);
  };

  CodeMirrorClient.prototype.redo = function () {
    this.unredoHelper(this.redoStack, this.undoStack);
  };
  
  CodeMirrorClient.prototype.createClientCursorEl = function (client) {
    var el = client.cursorEl = document.createElement('div');
    el.className = 'other-client';
    var pre = document.createElement('pre');
    pre.style.borderLeftColor = client.color;
    pre.innerHTML = '&nbsp;';
    el.appendChild(pre);
    //el.appendChild(document.createTextNode(client.name));
  };

  CodeMirrorClient.prototype.updateClientCursor = function (clientId, cursor, selectionEnd) {
    console.log(name + " moved his/her cursor: " + cursor);

    var client = this.getClientObject(clientId);
    client.cursor = cursor;
    client.selectionEnd = selectionEnd;

    this.updateClientCursorElPosition(client);
    this.updateClientMark(client);
  };

  CodeMirrorClient.prototype.updateClientCursorElPosition = function (client) {
    var pos = cm.posFromIndex(client.cursor);
    removeElement(client.cursorEl);
    this.cm.addWidget(pos, client.cursorEl, false);
  };

  CodeMirrorClient.prototype.updateClientMark = function (client) {
    if (client.mark) {
      client.mark.clear();
      delete client.mark;
    }
    if (client.selectionEnd !== client.cursor) {
      var from = Math.min(client.cursor, client.selectionEnd);
      var to   = Math.max(client.cursor, client.selectionEnd);
      var fromPos = cm.posFromIndex(from);
      var toPos   = cm.posFromIndex(to);
      client.mark = this.cm.markText(fromPos, toPos, client.selectionClassName);
    }
  };

  CodeMirrorClient.prototype.onCodeMirrorChange = function (change) {
    var cm = this.cm;
    try {
      if (!this.fromServer && !this.unredo) {
        var operation = this.createOperation()
          .fromCodeMirrorChange(change, this.oldValue);
        this.addOperationToUndo(operation.invert());
        this.applyClient(operation);
      }
    } finally {
      this.fromServer = false;
      this.unredo     = false;
      this.oldValue = cm.getValue();
    }
  };

  CodeMirrorClient.prototype.onCodeMirrorCursorActivity = function () {
    var cm = this.cm;
    function eqPos (a, b) {
      return a.line === b.line && a.ch === b.ch;
    }

    var cursorPos = cm.getCursor();
    var cursor = cm.indexFromPos(cursorPos);
    var selectionEnd;
    if (cm.somethingSelected()) {
      var startPos = cm.getCursor(true);
      var selectionEndPos = eqPos(cursorPos, startPos) ? cm.getCursor(false) : startPos;
      selectionEnd = cm.indexFromPos(selectionEndPos);
    } else {
      selectionEnd = cursor;
    }

    this.cursor = cursor;
    this.selectionEnd = selectionEnd;

    if (this.state === 'awaitingWithBuffer') {
      this.buffer.meta.cursor = cursor;
      this.buffer.meta.selectionEnd = selectionEnd;
    } else {
      var self = this;
      clearTimeout(this.sendCursorTimeout);
      this.sendCursorTimeout = setTimeout(function () {
        self.socket.emit('cursor', {
          cursor: cursor,
          selectionEnd: selectionEnd
        });
      }, 50);
    }
  };

  CodeMirrorClient.prototype.sendOperation = function (operation) {
    this.socket.emit('operation', operation);
  };

  CodeMirrorClient.prototype.applyOperation = function (operation) {
    this.fromServer = true;
    operation.applyToCodeMirror(this.cm);
  };

  // Set Const.prototype.__proto__ to Super.prototype
  function inherit (Const, Super) {
    function F () {}
    F.prototype = Super.prototype;
    Const.prototype = new F();
    Const.prototype.constructor = Const;
  }

  // Remove an element from the DOM.
  function removeElement (el) {
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }

  return CodeMirrorClient;
})();