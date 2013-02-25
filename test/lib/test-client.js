var TextOperation = require('../../lib/text-operation');
var Client = require('../../lib/client');

exports.testClient = function (test) {
  var client = new Client(1);
  test.strictEqual(client.revision, 1);
  test.ok(client.state instanceof Client.Synchronized);

  var sentRevision = null;
  var sentOperation = null;
  function getSentOperation () {
    var a = sentOperation;
    if (!a) { throw new Error("sendOperation wasn't called"); }
    sentOperation = null;
    return a;
  }
  function getSentRevision () {
    var a = sentRevision;
    if (typeof a !== 'number') { throw new Error("sendOperation wasn't called"); }
    sentRevision = null;
    return a;
  }
  client.sendOperation = function (revision, operation) {
    sentRevision = revision;
    sentOperation = operation;
  };

  var doc = "lorem dolor";
  var appliedOperation = null;
  function getAppliedOperation () {
    var a = appliedOperation;
    if (!a) { throw new Error("applyOperation wasn't called"); }
    appliedOperation = null;
    return a;
  }
  client.applyOperation = function (operation) {
    doc = operation.apply(doc);
    appliedOperation = operation;
  };

  function applyClient (operation) {
    doc = operation.apply(doc);
    client.applyClient(operation);
  }

  client.applyServer(new TextOperation().retain(6)['delete'](1).insert("D").retain(4));
  test.strictEqual(doc, "lorem Dolor");
  test.ok(client.state instanceof Client.Synchronized);
  test.strictEqual(client.revision, 2);

  applyClient(new TextOperation().retain(11).insert(" "));
  test.strictEqual(doc, "lorem Dolor ");
  test.ok(client.state instanceof Client.AwaitingConfirm);
  test.strictEqual(getSentRevision(), 2);
  test.ok(client.state.outstanding.equals(new TextOperation().retain(11).insert(" ")));
  test.ok(getSentOperation().equals(new TextOperation().retain(11).insert(" ")));

  client.applyServer(new TextOperation().retain(5).insert(" ").retain(6));
  test.strictEqual(doc, "lorem  Dolor ");
  test.strictEqual(client.revision, 3);
  test.ok(client.state instanceof Client.AwaitingConfirm);
  test.ok(client.state.outstanding.equals(new TextOperation().retain(12).insert(" ")));

  applyClient(new TextOperation().retain(13).insert("S"));
  test.ok(client.state instanceof Client.AwaitingWithBuffer);
  applyClient(new TextOperation().retain(14).insert("i"));
  applyClient(new TextOperation().retain(15).insert("t"));
  test.ok(!sentRevision && !sentOperation);
  test.strictEqual(doc, "lorem  Dolor Sit");
  test.ok(client.state.outstanding.equals(new TextOperation().retain(12).insert(" ")));
  test.ok(client.state.buffer.equals(new TextOperation().retain(13).insert("Sit")));

  client.applyServer(new TextOperation().retain(6).insert("Ipsum").retain(6));
  test.strictEqual(client.revision, 4);
  test.strictEqual(doc, "lorem Ipsum Dolor Sit");
  test.ok(client.state instanceof Client.AwaitingWithBuffer);
  test.ok(client.state.outstanding.equals(new TextOperation().retain(17).insert(" ")));
  test.ok(client.state.buffer.equals(new TextOperation().retain(18).insert("Sit")));

  client.serverAck();
  test.strictEqual(getSentRevision(), 5);
  test.ok(getSentOperation().equals(new TextOperation().retain(18).insert("Sit")));
  test.strictEqual(client.revision, 5);
  test.ok(client.state instanceof Client.AwaitingConfirm);
  test.ok(client.state.outstanding.equals(new TextOperation().retain(18).insert("Sit")));

  client.serverAck();
  test.strictEqual(client.revision, 6);
  test.ok(typeof sentRevision !== 'number');
  test.ok(client.state instanceof Client.Synchronized);
  test.strictEqual(doc, "lorem Ipsum Dolor Sit");

  // Test AwaitingConfirm and AwaitingWithBuffer resend operation.
  client.applyClient(new TextOperation().retain(21).insert("a"));
  test.ok(client.state instanceof Client.AwaitingConfirm);
  test.ok(!!client.state.resend);
  client.applyClient(new TextOperation().retain(22).insert("m"));
  test.ok(client.state instanceof Client.AwaitingWithBuffer);
  test.ok(!!client.state.resend);

  client.state.resend(client);
  test.ok(sentOperation.equals(new TextOperation().retain(21).insert('a')));
  client.serverAck();
  test.ok(sentOperation.equals(new TextOperation().retain(22).insert('m')));


  test.done();
};