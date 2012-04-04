(function () {
  var Client = ot_client.Client;
  var Operation = ot.Operation;

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
      //}, 1500);
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
      //mode: 'javascript',
      value: str,
      onChange: function (cm, change) {
        if (!fromServer) {
          var operation = client.createOperation();
          operation = codeMirrorChangeToOperation(operation, cm, change, oldValue);
          console.log(change, operation);
          client.applyClient(operation);
        }
        oldValue = cm.getValue();
      }
    });

    socket.on('operation', function (operation) {
      operation = Operation.fromJSON(operation);
      client.applyServer(operation);
    });
  }
})();
