(function () {
  var CodeMirrorClient = ot.CodeMirrorClient;

  var socket = io.connect('/');

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

  var name = window.prompt("Name");

  socket.emit('auth', { name: name });

  socket.once('doc', function (obj) {
    var str = obj.str, revision = obj.revision, users = obj.users;

    var wrapper = document.getElementById('wrapper');
    var cm = window.cm = CodeMirror(wrapper, {
      lineNumbers: true,
      lineWrapping: true,
      mode: 'markdown',
      value: str
    });

    var cmClient = new CodeMirrorClient(revision, cm, socket, name, users);
  });
})();
