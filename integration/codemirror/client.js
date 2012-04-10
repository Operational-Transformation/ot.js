(function () {
  var Client = ot.Client;
  var Operation = ot.Operation;

  var socket = io.connect('/');

  var name = window.prompt("Name");

  socket.emit('auth', { name: name });

  socket.once('doc', function (obj) {
    initialize(obj.str, obj.revision, obj.users);
  });
  
  function initialize (str, revision, users) {
    // uncomment to simulate more latency
    /*(function () {
      var emit = socket.emit;
      var queue = [];
      socket.emit = function () {
        queue.push(arguments);
      };
      setInterval(function () {
        if (queue.length) {
          emit.apply(socket, queue.shift());
        }
      }, 800);
    })();*/

    var client = new Client(revision);

    function createUserEl (name) {
      var el = document.createElement('div');
      el.className = 'other-user';
      var pre = document.createElement('pre');
      pre.innerHTML = '&nbsp;';
      el.appendChild(pre);
      el.appendChild(document.createTextNode(name));
      return el;
    }

    function removeEl (el) {
      el.parentNode.removeChild(el);
    }

    function updateUserElPosition (name) {
      var index = users[name].cursor;
      var pos = cm.posFromIndex(index);
      var el = users[name].el;
      if (el.parentNode) {
        removeEl(el);
      }
      cm.addWidget(pos, el, false);
    }

    function updateUserMark (name) {
      var userInfo = users[name];
      if (userInfo.mark) {
        userInfo.mark.clear();
      }
      if (typeof userInfo.otherCursor === 'number') {
        var from = Math.min(userInfo.cursor, userInfo.otherCursor);
        var to   = Math.max(userInfo.cursor, userInfo.otherCursor);
        var fromPos = cm.posFromIndex(from);
        var toPos   = cm.posFromIndex(to);
        userInfo.mark = cm.markText(fromPos, toPos, 'other-user-selection');
      } else {
        delete userInfo.mark;
      }
    }

    function initUser (name) {
      users[name].el = createUserEl(name);
      updateUserElPosition(name);
      updateUserMark(name);
    }

    client.sendOperation = function (operation) {
      socket.emit('operation', operation);
    };

    var fromServer = false;
    client.applyOperation = function (operation) {
      fromServer = true;
      codeMirrorApplyOperation(cm, operation);
      fromServer = false;
    };

    var wrapper = document.getElementById('wrapper');
    var oldValue = str;
    var cm = window.cm = CodeMirror(wrapper, {
      lineNumbers: true,
      mode: 'javascript',
      value: str,
      onChange: onChange,
      onCursorActivity: onCursorActivity
    });

    function onChange (cm, change) {
      if (!fromServer) {
        var operation = client.createOperation();
        operation = codeMirrorChangeToOperation(operation, cm, change, oldValue);
        console.log("onChange", change, operation);
        if (cursorBuffer) {
          operation.meta.index = cursorBuffer.index;
          cursorBuffer = null;
        }
        client.applyClient(operation);
      }
      oldValue = cm.getValue();
    }

    var cursorBuffer = null;

    function onCursorActivity (cm) {
      function eqPos (a, b) {
        return a.line === b.line && a.ch === b.ch;
      }

      var cursorPos = cm.getCursor();
      var cursorIndex = cm.indexFromPos(cursorPos);
      if (cm.somethingSelected()) {
        var startPos = cm.getCursor(true);
        var otherPos = eqPos(cursorPos, startPos)
                     ? cm.getCursor(false)
                     : startPos;
        var otherIndex = cm.indexFromPos(otherPos);
      }

      console.log("onCursorActivity", cursorPos, cursorIndex);
      if (client.state === 'awaitingWithBuffer') {
        client.buffer.meta.index = cursorIndex;
        if (otherIndex) { client.buffer.meta.otherIndex = otherIndex; }
      } else {
        cursorBuffer = { index: cursorIndex };
        if (otherIndex) { cursorBuffer.otherIndex = otherIndex; }
        setTimeout(function () {
          if (cursorBuffer) {
            socket.emit('cursor', cursorBuffer);
            cursorBuffer = null;
          }
        }, 1);
      }
    }

    socket.on('operation', function (operation) {
      console.log("Operation from server by user " + operation.meta.name + ":", operation);
      operation = Operation.fromJSON(operation);
      client.applyServer(operation);
      if (typeof operation.meta.index === 'number' && operation.meta.name !== name) {
        updateCursor(operation.meta);
      }
    });

    socket.on('user_joined', function (info) {
      console.log("User joined: " + info.name);
      users[info.name] = info;
      initUser(info.name);
    });

    socket.on('user_left', function (info) {
      console.log("User disconnected: " + info.name);
      removeEl(users[info.name].el);
      delete users[info.name];
    });

    socket.on('cursor', updateCursor);

    function updateCursor (obj) {
      console.log(obj.name + " moved his/her cursor: " + obj.index);
      users[obj.name].cursor = obj.index;
      users[obj.name].otherCursor = obj.otherIndex;
      updateUserElPosition(obj.name);
      updateUserMark(obj.name);
    }

    (function () {
      for (var name in users) {
        if (users.hasOwnProperty(name)) {
          users[name].name = name;
          initUser(name);
        }
      }
    })();
  }
})();
