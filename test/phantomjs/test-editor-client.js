/*global ot, ok, test, strictEqual, deepEqual, notEqual */

(function () {
  'use strict';

  var EditorClient = ot.EditorClient;
  var Client = ot.Client;
  var Selection = ot.Selection;
  var Range = Selection.Range;
  var TextOperation = ot.TextOperation;

  function EditorAdapterStub (value, selection) {
    this.value = value;
    this.selection = selection;
    this.undo = this.redo = null;
    this.lastAppliedOperation = null;
    this.otherSelections = [];
  }

  EditorAdapterStub.prototype.registerCallbacks = function (cb) {
    this.callbacks = cb;
  };

  EditorAdapterStub.prototype.registerUndo = function (undo) { this.undo = undo; };
  EditorAdapterStub.prototype.registerRedo = function (redo) { this.redo = redo; };

  EditorAdapterStub.prototype.trigger = function (event) {
    var args = Array.prototype.slice.call(arguments, 1);
    var action = this.callbacks && this.callbacks[event];
    if (action) { action.apply(this, args); }
  };

  EditorAdapterStub.prototype.getValue = function () {
    return this.value;
  };

  EditorAdapterStub.prototype.getSelection = function () {
    return this.selection;
  };

  EditorAdapterStub.prototype.setSelection = function (selection) {
    this.selection = selection;
    this.trigger('selectionChange');
  };

  EditorAdapterStub.prototype.blur = function () {
    this.selection = null;
    this.trigger('blur');
  };

  EditorAdapterStub.prototype.setOtherSelection = function (selection, color, clientId) {
    var otherSelections = this.otherSelections;
    var cleared = false;
    var selectionObj = {
      selection: selection,
      color: color,
      clientId: clientId
    };
    otherSelections.push(selectionObj);
    return {
      clear: function () {
        if (cleared) { throw new Error("already cleared!"); }
        cleared = true;
        otherSelections.splice(otherSelections.indexOf(selectionObj), 1);
      }
    };
  };

  EditorAdapterStub.prototype.applyOperation = function (operation) {
    this.lastAppliedOperation = operation;
    this.value = operation.apply(this.value);
    if (this.selection) {
      var newSelection = this.selection.transform(operation);
      if (!this.selection.equals(newSelection)) {
        this.selection = newSelection;
        this.trigger('selectionChange');
      }
    }
  };


  function ServerAdapterStub () {
    this.sentOperation = this.sentSelection = null;
  }

  ServerAdapterStub.prototype.registerCallbacks = EditorAdapterStub.prototype.registerCallbacks;
  ServerAdapterStub.prototype.trigger = EditorAdapterStub.prototype.trigger;

  ServerAdapterStub.prototype.sendOperation = function (revision, operation, selection) {
    this.sentRevision = revision;
    this.sentOperation = operation;
    this.sentSelectionWithOperation = selection;
  };
  ServerAdapterStub.prototype.sendSelection = function (selection) {
    this.sentSelection = selection;
  };

  var revision, initialDoc, clients, serverAdapter, editorAdapter, editorClient;
  function setup () {
    revision = 1;
    initialDoc = "lorem dolor";
    clients = {
      'enihcam': { name: "Tim", selection: { ranges: [{ anchor: 0, head: 0 }, { anchor: 2, head: 4 }] } },
      'baia':    { name: "Jan", selection: { ranges: [{ anchor: 6, head: 7 }] } }
    };
    serverAdapter = new ServerAdapterStub();
    editorAdapter = new EditorAdapterStub(initialDoc, Selection.createCursor(11));
    editorClient = new EditorClient(revision, clients, serverAdapter, editorAdapter);
  }

  test("register undo and redo functions", function () {
    setup();
    ok(typeof editorAdapter.undo === 'function');
    ok(typeof editorAdapter.redo === 'function');
  });

  test("simulated editing session", function () {
    setup();
    // Let's say, we are Nina and we're editing a document together with Tim and Jan

    // Firstly, we get informed one of them has replaced the lower case 'd' with a capital 'D'
    serverAdapter.trigger('operation', [6, -1, 'D', 4]);
    strictEqual(editorAdapter.getValue(), "lorem Dolor");
    ok(editorClient.state instanceof Client.Synchronized);
    strictEqual(editorClient.revision, 2);

    // We append a single white space to the document
    editorAdapter.value = "lorem Dolor ";
    editorAdapter.selection = Selection.createCursor(12);
    editorAdapter.trigger('change',
      new TextOperation().retain(11).insert(" "),
      new TextOperation().retain(11)['delete'](1)
    );
    editorAdapter.trigger('selectionChange');
    ok(editorClient.state instanceof Client.AwaitingConfirm);
    strictEqual(serverAdapter.sentRevision, 2);
    ok(editorClient.state.outstanding.equals(new TextOperation().retain(11).insert(" ")));
    deepEqual(serverAdapter.sentOperation, [11, " "]);
    ok(serverAdapter.sentSelectionWithOperation.equals(Selection.createCursor(12)));
    strictEqual(serverAdapter.sentSelection, null);

    // Someone inserts an extra white space between "lorem" and "Dolor"
    serverAdapter.trigger('operation', [5, " ", 6]);
    strictEqual(editorAdapter.getValue(), "lorem  Dolor ");
    strictEqual(editorClient.revision, 3);
    ok(editorClient.state instanceof Client.AwaitingConfirm);
    ok(editorClient.state.outstanding.equals(new TextOperation().retain(12).insert(" ")));

    // Our cursor moved one char to the right because of that insertion. That
    // info should have been sent.
    ok(editorAdapter.selection.equals(Selection.createCursor(13)));
    ok(serverAdapter.sentSelection.equals(Selection.createCursor(13)));

    // We append "S" at the end
    editorAdapter.value = "lorem  Dolor S";
    editorAdapter.selection = Selection.createCursor(14);
    editorAdapter.trigger('change',
      new TextOperation().retain(13).insert("S"),
      new TextOperation().retain(13)['delete'](1)
    );
    editorAdapter.trigger('selectionChange');
    // This operation should have been buffered
    ok(editorClient.state instanceof Client.AwaitingWithBuffer);
    strictEqual(serverAdapter.sentRevision, 2); // last revision
    deepEqual(serverAdapter.sentOperation, [11, " "]); // last operation
    ok(serverAdapter.sentSelection.equals(Selection.createCursor(13)));

    // We continue with the letters "it"
    editorAdapter.value = "lorem  Dolor Sit";
    editorAdapter.selection = Selection.createCursor(15);
    editorAdapter.trigger('change',
      new TextOperation().retain(14).insert("i"),
      new TextOperation().retain(14)['delete'](1)
    );
    editorAdapter.selection = Selection.createCursor(16);
    editorAdapter.trigger('selectionChange');
    editorAdapter.trigger('change',
      new TextOperation().retain(15).insert("t"),
      new TextOperation().retain(15)['delete'](1)
    );
    editorAdapter.trigger('selectionChange');
    ok(serverAdapter.sentSelection.equals(Selection.createCursor(13)));
    strictEqual(serverAdapter.sentRevision, 2); // last revision
    deepEqual(serverAdapter.sentOperation, [11, " "]); // last operation
    ok(editorClient.state.outstanding.equals(new TextOperation().retain(12).insert(" ")));
    ok(editorClient.state.buffer.equals(new TextOperation().retain(13).insert("Sit")));

    // Someone inserts "Ipsum" between "lorem" and "Dolor"
    serverAdapter.trigger('operation', [6, "Ipsum", 6]);
    strictEqual(editorClient.revision, 4);
    strictEqual(editorAdapter.getValue(), "lorem Ipsum Dolor Sit");
    ok(editorClient.state instanceof Client.AwaitingWithBuffer);
    ok(editorClient.state.outstanding.equals(new TextOperation().retain(17).insert(" ")));
    ok(editorClient.state.buffer.equals(new TextOperation().retain(18).insert("Sit")));
    // Our cursor should have been shifted by that operation to position 21
    ok(editorAdapter.selection.equals(Selection.createCursor(21)));

    // We get an acknowledgement for our first sent operation from the server!
    serverAdapter.trigger('ack');
    strictEqual(serverAdapter.sentRevision, 5);
    deepEqual(serverAdapter.sentOperation, [18, "Sit"]);
    strictEqual(editorClient.revision, 5);
    ok(editorClient.state instanceof Client.AwaitingConfirm);
    ok(editorClient.state.outstanding.equals(new TextOperation().retain(18).insert("Sit")));

    // We switch to another program. The browser window and the editor lose their
    // focus.
    editorAdapter.trigger('blur');
    strictEqual(serverAdapter.sentSelection, null);

    // The operation that was sent a few moments ago gets acknowledged right away
    serverAdapter.trigger('ack');
    strictEqual(editorClient.revision, 6);
    strictEqual(serverAdapter.sentRevision, 5);
    ok(editorClient.state instanceof Client.Synchronized);
    strictEqual(editorAdapter.getValue(), "lorem Ipsum Dolor Sit");
  });

  test("user handling", function () {
    setup();

    strictEqual(editorClient.clientListEl.childNodes.length, 2);
    var firstLi  = editorClient.clientListEl.childNodes[0];
    var secondLi = editorClient.clientListEl.childNodes[1];
    strictEqual(firstLi.tagName.toLowerCase(), 'li');
    strictEqual(firstLi.innerHTML, "Tim");
    strictEqual(secondLi.tagName.toLowerCase(), 'li');
    strictEqual(secondLi.innerHTML, "Jan");
    notEqual(firstLi.style.color, secondLi.style.color);

    deepEqual(editorAdapter.otherSelections, [
      {
        clientId: 'enihcam',
        color: editorAdapter.otherSelections[0].color,
        selection: new Selection([new Range(0, 0), new Range(2, 4)])
      },
      {
        clientId: 'baia',
        color: editorAdapter.otherSelections[1].color,
        selection: new Selection([new Range(6, 7)])
      }
    ]);

    // We insert an extra space between "lorem" and "dolor"
    editorAdapter.value = "lorem  dolor";
    editorAdapter.selection = Selection.createCursor(6);
    editorAdapter.trigger('change',
      new TextOperation().retain(5).insert(" ").retain(6),
      new TextOperation().retain(5)['delete'](1).retain(6)
    );
    editorAdapter.trigger('selectionChange');

    // Jan selects some text that spans the position of our insertion
    serverAdapter.trigger('selection', 'baia', { ranges: [{ anchor: 4, head: 7 }] });
    deepEqual(editorAdapter.otherSelections, [
      {
        clientId: 'enihcam',
        color: editorAdapter.otherSelections[0].color,
        selection: new Selection([new Range(0, 0), new Range(2, 4)])
      },
      {
        clientId: 'baia',
        color: editorAdapter.otherSelections[1].color,
        // because of our insertion, the selection spans one more character
        selection: new Selection([new Range(4, 8)])
      }
    ]);

    // Tim's editor loses focus
    serverAdapter.trigger('selection', 'enihcam', null);
    deepEqual(editorAdapter.otherSelections, [
      {
        clientId: 'baia',
        color: editorAdapter.otherSelections[0].color,
        // because of our insertion, the selection spans one more character
        selection: new Selection([new Range(4, 8)])
      }
    ]);

    // Tim closes his browser
    strictEqual(editorClient.clientListEl.childNodes.length, 2);
    serverAdapter.trigger('client_left', 'enihcam');
    strictEqual(editorClient.clientListEl.childNodes.length, 1);
    ok(!firstLi.parentNode);
    strictEqual(secondLi.parentNode, editorClient.clientListEl);

    // A new user joins!
    serverAdapter.trigger('set_name', 'emit-remmus', "Nina");
    strictEqual(editorClient.clientListEl.childNodes.length, 2);
    strictEqual(editorClient.clientListEl.childNodes[1].innerHTML, "Nina");

    // We get an update consisting of the state of all connected users:
    // Tim rejoined, Jan left, Nina updated her cursor
    serverAdapter.trigger('clients', {
      'enihcam':     { name: "Tim", selection: null },
      'emit-remmus': { name: "Nina", selection: { ranges: [{ anchor: 0, head: 0 }] } }
    });
    strictEqual(editorClient.clientListEl.childNodes.length, 2);
    strictEqual(editorClient.clientListEl.childNodes[0].innerHTML, "Nina");
    strictEqual(editorClient.clientListEl.childNodes[1].innerHTML, "Tim");
    deepEqual(editorAdapter.otherSelections, [
      {
        clientId: 'emit-remmus',
        color: editorAdapter.otherSelections[0].color,
        // because of our insertion, the selection spans one more character
        selection: Selection.createCursor(0)
      }
    ]);
  });

  test("undo/redo", function () {
    setup();
    editorAdapter.selection = new Selection([new Range(6, 11)]);
    editorAdapter.trigger('selectionChange');

    editorAdapter.value = "lorem s";
    editorAdapter.selection = Selection.createCursor(7);
    editorAdapter.trigger('change',
      new TextOperation().retain(6)['delete'](5).insert("s"),
      new TextOperation().retain(6)['delete'](1).insert("dolor")
    );
    editorAdapter.trigger('selectionChange');

    // Someone inserts an extra white space between "lorem" and "dolor"
    serverAdapter.trigger('operation', [5, " ", 6]);
    strictEqual(editorAdapter.getValue(), "lorem  s");

    editorClient.undo();
    strictEqual(editorAdapter.getValue(), "lorem  dolor");
    ok(editorAdapter.getSelection().equals(new Selection([new Range(7, 12)])));

    editorClient.redo();
    strictEqual(editorAdapter.getValue(), "lorem  s");
    ok(editorAdapter.getSelection().equals(Selection.createCursor(8)));
  });

})();

// Not tested:
// Reaction to server adapter event 'reconnect'
