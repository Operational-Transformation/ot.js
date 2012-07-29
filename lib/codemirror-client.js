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
    Client.prototype.applyServer.call(this, operation);
  };

  CodeMirrorClient.prototype.initializeSocket = function () {
    var self = this;

    this.socket
      .on('client_left', function (obj) {
        self.onClientLeft(obj.clientId);
      })
      .on('set_name', function (obj) {
        var client = self.getClientObject(obj.clientId);
        client.setName(obj.name);
      })
      .on('operation', function (operationObj) {
        var operation = Operation.fromJSON(operationObj);
        console.log("Operation from server by client " + operation.meta.clientId + ":", operation);
        self.applyServer(operation);
      })
      .on('cursor', function (obj) {
        var client = self.getClientObject(obj.clientId);
        client.updateCursor(obj.cursor, obj.selectionEnd);
      });
  };



  function OtherClient (id, listEl, cm, name, cursor, selectionEnd) {
    this.id = id;
    this.listEl = listEl;
    this.cm = cm;
    this.name = name;
    this.selectionClassName = 'client-selection-' + randomInt(1e6);

    this.li = document.createElement('li');
    if (name) {
      this.li.textContent = name;
      this.listEl.appendChild(this.li);
    }

    this.cursorEl = document.createElement('div');
    this.cursorEl.className = 'other-client';
    this.pre = document.createElement('pre');
    this.pre.innerHTML = '&nbsp;';
    this.cursorEl.appendChild(this.pre);

    if (typeof cursor === 'number' && typeof selectionEnd === 'number') {
      this.updateCursor(cursor, selectionEnd);
    }
    this.setColor(name ? hueFromName(name) : Math.random());
  }

  OtherClient.prototype.setColor = function (hue) {
    this.hue = hue;

    var color = hsl2hex(hue, 0.75, 0.5);
    if (this.li) { this.li.style.color = color; }
    this.pre.style.borderLeftColor = color;

    var lightColor = hsl2hex(hue, 0.5, 0.9);
    var selector = '.' + this.selectionClassName;
    var styles = 'background:' + lightColor + ';';
    var rule = selector + '{' + styles + '}';
    addStyleRule(rule);
  };

  OtherClient.prototype.setName = function (name) {
    this.name = name;

    this.li.textContent = name;
    if (!this.li.parentNode) {
      this.listEl.appendChild(this.li);
    }

    this.setColor(hueFromName(name));
  };

  OtherClient.prototype.updateCursor = function (cursor, selectionEnd) {
    this.cursor = cursor;
    this.selectionEnd = selectionEnd;

    var cursorPos = cm.posFromIndex(cursor);
    removeElement(this.cursorEl);
    this.cm.addWidget(cursorPos, this.cursorEl, false);

    if (this.mark) {
      this.mark.clear();
      delete this.mark;
    }
    if (cursor !== selectionEnd) {
      var fromPos, toPos;
      if (selectionEnd > cursor) {
        fromPos = cursorPos;
        toPos = this.cm.posFromIndex(selectionEnd);
      } else {
        fromPos = this.cm.posFromIndex(selectionEnd);
        toPos = cursorPos;
      }
      this.mark = this.cm.markText(fromPos, toPos, this.selectionClassName);
    }
  };

  OtherClient.prototype.remove = function () {
    if (this.li) { removeElement(this.li); }
    if (this.cursorEl) { removeElement(this.cursorEl); }
    if (this.mark) { this.mark.clear(); }
  };



  CodeMirrorClient.prototype.getClientObject = function (clientId) {
    var client = this.clients[clientId];
    if (client) { return client; }
    return this.clients[clientId] = new OtherClient(clientId, this.clientListEl, this.cm);
  };

  CodeMirrorClient.prototype.onClientLeft = function (clientId) {
    console.log("User disconnected: " + clientId);
    var client = this.clients[clientId];
    if (!client) { return; }
    client.remove();
    delete this.clients[clientId];
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
        client.clientId = clientId;
        this.clients[clientId] = new OtherClient(
          client.clientId, this.clientListEl, this.cm,
          client.name, client.cursor, client.selectionEnd
        );
      }
    }
  };

  CodeMirrorClient.prototype.initializeClientList = function () {
    this.clientListEl = document.createElement('ul');
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
    targetStack.push(operation.invert(this.oldValue));
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
          return opA.retain === opsB[0].delete;
        } else {
          return opA.retain === opsB[0].retain + opsB[1].delete;
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

  CodeMirrorClient.prototype.onCodeMirrorChange = function (change) {
    var cm = this.cm;
    try {
      if (!this.fromServer && !this.unredo) {
        var operation = this.createOperation()
          .fromCodeMirrorChange(change, this.oldValue);
        this.addOperationToUndo(operation.invert(this.oldValue));
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

    var meta = operation.meta;
    var client = this.getClientObject(meta.clientId);
    client.updateCursor(meta.cursor, meta.selectionEnd);

    this.transformUnredoStack(this.undoStack, operation);
    this.transformUnredoStack(this.redoStack, operation);
  };

  function randomInt (n) {
    return Math.floor(Math.random() * n);
  }

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

  function hueFromName (name) {
    var a = 1;
    for (var i = 0; i < name.length; i++) {
      a = 17 * (a+name.charCodeAt(i)) % 360;
    }
    return a/360;
  }

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

  function addStyleRule (css) {
    try {
      var styleSheet = document.styleSheets.item(0),
          insertionPoint = (styleSheet.rules? styleSheet.rules:
              styleSheet.cssRules).length;
      styleSheet.insertRule(css, insertionPoint);
    } catch (exc) {
      console.error("Couldn't add style rule.", exc);
    }
  }

  return CodeMirrorClient;
})();
