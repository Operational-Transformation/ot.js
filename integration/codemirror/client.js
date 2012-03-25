(function () {
  function codeMirrorChangeToOperation (operation, cm, change, oldValue) {
    var newValue = cm.getValue();
    var from = cm.indexFromPos(change.from);
    var text = change.text.join('\n');
    var diff = newValue.length - oldValue.length;
    var deletedChars = text.length - diff;

    if (from > 0) {
      operation.retain(from);
    }
    if (deletedChars > 0) {
      operation.delete(oldValue.slice(from, from + deletedChars));
    }
    if (text) {
      operation.insert(text);
    }
    if (oldValue.length - operation.baseLength > 0) {
      operation.retain(oldValue.length - operation.baseLength);
    }

    return operation;
  }

  function codeMirrorApplyOperation (cm, operation) {
    cm.operation(function () {
      var ops = operation.ops;
      var index = 0;
      for (var i = 0, l = ops.length; i < l; i++) {
        var op = ops[i];
        if (op.retain) {
          index += op.retain;
        } else if (op.insert) {
          cm.replaceRange(op.insert, cm.posFromIndex(index));
          index += op.insert.length;
        } else if (op.delete) {
          var from = cm.posFromIndex(index);
          var to   = cm.posFromIndex(index + op.delete.length);
          assert(cm.getRange(from, to) === op.delete);
          cm.replaceRange('', from, to);
        }
      }
      assert(index === cm.getValue().length);
    });
  }

  function assert (b, msg) {
    if (!b) {
      throw new Error(msg || "assertion error");
    }
  }

  var Client = ot_client.Client;

  var socket = io.connect('/');
  socket.on('doc', function (obj) {
    initialize(obj.str, obj.revision);
  });

  function initialize (str, revision) {
    var client = new Client(revision);

    client.sendOperation = function (operation) {
      // uncomment to simulate more latency
      //setTimeout(function () {
        socket.emit('operation', operation);
      //}, 500);
    };

    var fromServer = false;
    client.applyOperation = function (operation) {
      fromServer = true;
      codeMirrorApplyOperation(cm, operation);
      fromServer = false;
    };

    var wrapper = document.getElementById('wrapper');
    var oldValue = str;
    var cm = CodeMirror(wrapper, {
      lineNumbers: true,
      //mode: 'javascript',
      value: str,
      onChange: function (cm, change) {
        if (fromServer) {
          oldValue = cm.getValue();
        } else {
          var operation = client.createOperation();
          var operation = codeMirrorChangeToOperation(operation, cm, change, oldValue);
          console.log(change, operation);
          client.applyClient(operation);
          oldValue = cm.getValue();
        }
      }
    });

    socket.on('operation', function (operation) {
      operation = operational_transformation.Operation.fromJSON(operation);
      client.applyServer(operation);
    });
  }
})();
