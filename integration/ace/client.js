window.onload = function () {
  var Range = require('ace/range').Range;

  function acePosToIndex (editor, pos) {
    var index = 0;
    var session = editor.getSession();
    for (var i = 0; i < pos.row; i++) {
      index += session.getLine(i).length + 1;
    }
    return index + pos.column;
  }

  function aceChangeToOperation (operation, editor, change, oldValue) {
    var from = acePosToIndex(editor, change.range.start);
    operation.retain(from);
    if (change.action === 'insertText') {
      operation.insert(change.text);
      operation.retain(oldValue.length - from);
    } else if (change.action === 'removeText') {
      var newValue = editor.getSession().getValue();
      var deletedChars = oldValue.length - newValue.length;
      operation.delete(oldValue.slice(from, from + deletedChars));
      operation.retain(newValue.length - from);
    } else if (change.action === 'removeLines') {
      var newValue = editor.getSession().getValue();
      operation.delete(change.lines.join('\n') + '\n');
      operation.retain(newValue.length - from);
    } else {
      console.log("unknown operation: ", change);
    }
    return operation;
  }

  function aceApplyOperation (editor, operation) {
    var doc = editor.getSession().getDocument();

    var row = 0, line = doc.getLine(row), column = 0;
    function advance (n) {
      while (n > line.length - column) {
        n -= line.length - column + 1;
        column = 0;
        line = doc.getLine(++row);
      }
      column += n;
    }

    var ops = operation.ops;
    for (var i = 0, l = ops.length; i < l; i++) {
      var op = ops[i];
      if (op.retain) {
        advance(op.retain);
      } else if (op.insert) {
        doc.insert({ row: row, column: column }, op.insert);
        line = doc.getLine(row);
        advance(op.insert.length);
      } else if (op.delete) {
        var startRow = row, startColumn = column;
        advance(op.delete.length);
        var range = new Range(startRow, startColumn, row, column);
        doc.remove(range);
        row = startRow; line = doc.getLine(row); column = startColumn;
      }
    }

    assert(row === doc.getLength() - 1 && column === line.length);
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
      aceApplyOperation(editor, operation);
      fromServer = false;
    };

    var editor = ace.edit('editor');
    var session = editor.getSession();
    session.setValue(str);

    var oldValue = str;
    session.on('change', function (event) {
      //console.log(event.data.action, event.data.range, event.data.text);
      if (!fromServer) {
        var change = event.data;
        var operation = client.createOperation();
        var operation = aceChangeToOperation(operation, editor, change, oldValue);
        console.log(change, operation);
        client.applyClient(operation);
      }
      oldValue = session.getValue();
    });

    socket.on('operation', function (operation) {
      operation = operational_transformation.Operation.fromJSON(operation);
      client.applyServer(operation);
    });
  }
};