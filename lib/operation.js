if (typeof ot === 'undefined') {
  // Export for browsers
  var ot = {};
}

ot.Operation = (function () {

  // Constructor for new operations. Expects an revision number (non-negative
  // integer) and an optional ID (string). If no ID is given, a random ID will
  // be generated.
  function Operation (revision, id, meta) {
    assert(
      typeof revision === 'number' && revision >= 0,
      "the first parameter to the the parent revision number of the document"
    );
    this.revision = revision;
    this.id = id || randomID();
    assert(this.id && typeof this.id === 'string', "not a valid id: " + this.id);

    // Place to store arbitrary data. This could be a timestamp of the edit, the
    // name of the author, etc...
    this.meta = meta || {};

    // When an operation is applied to an input string, you can think of this as
    // if an imaginary cursor runs over the entire string and skips over some
    // parts, deletes some parts and inserts characters at some positions. These
    // actions (skip/delete/insert) are stored as an array in the "ops" property.
    this.ops = [];
    // An operation's baseLength is the length of every string the operation
    // can be applied to.
    this.baseLength = 0;
    // The targetLength is the length of every string that results from applying
    // the operation on a valid input string.
    this.targetLength = 0;
  }

  // After an operation is constructed, the user of the library can specify the
  // actions of an operation (skip/insert/delete) with these three builder
  // methods. They all return the operation for convenient chaining.

  // Skip over a given number of characters.
  Operation.prototype.retain = function (n) {
    assert(typeof n === 'number' && n >= 0);
    if (n === 0) { return this; }
    this.baseLength += n;
    this.targetLength += n;
    var lastOp = this.ops[this.ops.length-1];
    if (lastOp && lastOp.retain) {
      // The last op is a retain op => we can merge them into one op.
      lastOp.retain += n;
    } else {
      // Create a new op.
      this.ops.push({ retain: n });
    }
    return this;
  };

  // Insert a string at the current position.
  Operation.prototype.insert = function (str) {
    assert(typeof str === 'string');
    if (str === '') { return this; }
    this.targetLength += str.length;
    var lastOp = this.ops[this.ops.length-1];
    if (lastOp && lastOp.insert) {
      // Merge insert op.
      lastOp.insert += str;
    } else {
      this.ops.push({ insert: str });
    }
    return this;
  };

  // Delete a string at the current position.
  Operation.prototype.delete = function (n) {
    if (typeof n === 'string') { n = n.length; }
    assert(typeof n === 'number');
    if (n === 0) { return this; }
    this.baseLength += n;
    var lastOp = this.ops[this.ops.length-1];
    if (lastOp && lastOp.delete) {
      lastOp.delete += n;
    } else {
      this.ops.push({ delete: n });
    }
    return this;
  };

  // Pretty printing.
  Operation.prototype.toString = function () {
    // map: build a new array by applying a function to every element in an old
    // array.
    var map = Array.prototype.map || function (fn) {
      var arr = this;
      var newArr = [];
      for (var i = 0, l = arr.length; i < l; i++) {
        newArr[i] = fn(arr[i]);
      }
      return newArr;
    };
    return map.call(this.ops, function (op) {
      return op.retain
             ? "retain " + op.retain
             : (op.insert
                ? "insert '" + op.insert + "'"
                : "delete " + op.delete);
    }).join(', ');
  };

  // Converts a plain JS object into an operation and validates it.
  Operation.fromJSON = function (obj) {
    assert(obj.id);
    var o = new Operation(obj.revision, obj.id, obj.meta);
    assert(typeof o.meta === 'object');
    var ops = obj.ops;
    for (var i = 0, l = ops.length; i < l; i++) {
      var op = ops[i];
      if (op.retain) {
        o.retain(op.retain);
      } else if (op.insert) {
        o.insert(op.insert);
      } else if (op.delete) {
        o.delete(op.delete);
      } else {
        throw new Error("unknown operation: " + JSON.stringify(op));
      }
    }
    assert(o.baseLength === obj.baseLength, "baseLengths don't match");
    assert(o.targetLength === obj.targetLength, "targetLengths don't match");
    return o;
  };

  // Apply an operation to a string, returning a new string. Throws an error if
  // there's a mismatch between the input string and the operation.
  Operation.prototype.apply = function (str) {
    var operation = this;
    if (str.length !== operation.baseLength) {
      throw new Error("The operation's base length must be equal to the string's length.");
    }
    var newStr = [], j = 0;
    var strIndex = 0;
    var ops = this.ops;
    for (var i = 0, l = ops.length; i < l; i++) {
      var op = ops[i];
      if (op.retain) {
        if (strIndex + op.retain > str.length) {
          throw new Error("Operation can't retain more characters than are left in the string.");
        }
        // Copy skipped part of the old string.
        newStr[j++] = str.slice(strIndex, strIndex + op.retain);
        strIndex += op.retain;
      } else if (op.insert) {
        // Insert string.
        newStr[j++] = op.insert;
      } else { // delete op
        strIndex += op.delete;
      }
    }
    if (strIndex !== str.length) {
      throw new Error("The operation didn't operate on the whole string.");
    }
    return newStr.join('');
  };

  // Computes the inverse of an operation. The inverse of an operation is the
  // operation that reverts the effects of the operation, e.g. when you have an
  // operation 'insert("hello "); skip(6);' then the inverse is 'delete("hello ");
  // skip(6);'. The inverse should be used for implementing undo.
  Operation.prototype.invert = function (str) {
    var strIndex = 0;
    var inverse = new Operation(this.revision + 1);
    var ops = this.ops;
    for (var i = 0, l = ops.length; i < l; i++) {
      var op = ops[i];
      if (op.retain) {
        inverse.retain(op.retain);
        strIndex += op.retain;
      } else if (op.insert) {
        inverse.delete(op.insert.length);
      } else { // delete op
        inverse.insert(str.slice(strIndex, strIndex + op.delete));
        strIndex += op.delete;
      }
    }
    return inverse;
  };

  // Compose merges to consecutive operations (they must have consecutive
  // revision numbers) into one operation, that preserves the changes of both.
  // Or, in other words, for each input string S and a pair of consecutive
  // operations A and B, apply(apply(S, A), B) = apply(S, compose(A, B)) must
  // hold.
  Operation.prototype.compose = function (operation2) {
    var operation1 = this;
    if (operation1.targetLength !== operation2.baseLength) {
      throw new Error("The base length of the second operation has to be the target length of the first operation");
    }
    if (operation1.revision + 1 !== operation2.revision) {
      throw new Error("The second operations revision must be one more than the first operations revision");
    }
    var operation = new Operation(operation1.revision, undefined, operation1.meta); // the combined operation
    var ops1 = operation1.ops, ops2 = operation2.ops; // for fast access
    var i1 = 0, i2 = 0; // current index into ops1 respectively ops2
    var op1 = ops1[i1++], op2 = ops2[i2++]; // current ops
    while (true) {
      // save length of current ops
      var op1l = op1 && (op1.retain || op1.delete || op1.insert.length);
      var op2l = op2 && (op2.retain || op2.delete || op2.insert.length);
      var minl = Math.min(op1l, op2l);
      // Dispatch on the type of op1 and op2
      if (typeof op1 === 'undefined' && typeof op2 === 'undefined') {
        // end condition: both ops1 and ops2 have been processed
        break;
      } else if (typeof op1 === 'undefined') {
        if (!op2.insert) {
          throw new Error("Successive operations can only insert new characters at the end of the string.");
        }
        operation.insert(op2.insert);
        op2 = ops2[i2++];
      } else if (typeof op2 === 'undefined') {
        if (!op1.delete) {
          throw new Error("The first operation can only delete at the end of operation 2.");
        }
        operation.delete(op1.delete);
        op1 = ops1[i1++];
      } else if (op1.retain && op2.retain) {
        operation.retain(minl);
        if (op1l > op2l) {
          op1 = { retain: op1l - op2l };
          op2 = ops2[i2++];
        } else if (op1l === op2l) {
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          op1 = ops1[i1++];
          op2 = { retain: op2l - op1l };
        }
      } else if (op1.insert && op2.delete) {
        if (op1l > op2l) {
          op1 = { insert: op1.insert.slice(op2l) };
          op2 = ops2[i2++];
        } else if (op1l === op2l) {
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          op1 = ops1[i1++];
          op2 = { delete: op2.delete - op1l };
        }
      } else if (op1.insert && op2.retain) {
        if (op1l > op2l) {
          operation.insert(op1.insert.slice(0, op2l));
          op1 = { insert: op1.insert.slice(op2l) };
          op2 = ops2[i2++];
        } else if (op1l === op2l) {
          operation.insert(op1.insert);
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          operation.insert(op1.insert);
          op1 =ops1[i1++];
          op2 = { retain: op2l - op1l };
        }
      } else if (op1.retain && op2.delete) {
        if (op1l > op2l) {
          operation.delete(op2.delete);
          op1 = { retain: op1l - op2l };
          op2 = ops2[i2++];
        } else if (op1l === op2l) {
          operation.delete(op2.delete);
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          operation.delete(op1l);
          op1 = ops1[i1++];
          op2 = { delete: op2.delete - op1l };
        }
      } else if (op1.delete) {
        operation.delete(op1.delete);
        op1 = ops1[i1++];
      } else if (op2.insert) {
        operation.insert(op2.insert);
        op2 = ops2[i2++];
      } else {
        throw new Error(
          "This shouldn't happen: op1: " +
          JSON.stringify(op1) + ", op2: " +
          JSON.stringify(op2)
        );
      }
    }
    return operation;
  };

  // Transform takes two operations A and B that happened concurrently and
  // produces two operations A' and B' (in an arry) such that
  // apply(apply(S, A), B') = apply(apply(S, B), A'). This function is the heart
  // of OT.
  Operation.transform = function (operation1, operation2) {
    if (operation1.baseLength !== operation2.baseLength) {
      throw new Error("Both operations have to have the same base length");
    }
    if (operation1.revision !== operation2.revision) {
      throw new Error("Both operations have to have the same revision");
    }

    // Use the IDs of the two input operations. This enables clients to
    // recognize their own operations when they receive operations from the
    // server.
    var operation1prime = new Operation(operation2.revision + 1, operation1.id, operation1.meta);
    var operation2prime = new Operation(operation1.revision + 1, operation2.id, operation2.meta);
    var ops1 = operation1.ops, ops2 = operation2.ops;
    var i1 = 0, i2 = 0;
    var op1 = ops1[i1++], op2 = ops2[i2++];
    while (true) {
      // At every iteration of the loop, the imaginary cursor that both
      // operation1 and operation2 have that operates on the input string must
      // have the same position in the input string.
      var op1l = op1 && (op1.retain || op1.delete || op1.insert.length);
      var op2l = op2 && (op2.retain || op2.delete || op2.insert.length);
      var minl = Math.min(op1l, op2l);
      if (typeof op1 === 'undefined' && typeof op2 === 'undefined') {
        // end condition: both ops1 and ops2 have been processed
        break;
      // next two cases: one or both ops are insert ops
      // => insert the string in the corresponding prime operation, skip it in
      // the other one
      // If both op1 and op2 are insert ops, prefer op1.
      } else if (op1 && op1.insert) {
        operation1prime.insert(op1.insert);
        operation2prime.retain(op1.insert.length);
        op1 = ops1[i1++];
      } else if (op2 && op2.insert) {
        operation1prime.retain(op2.insert.length);
        operation2prime.insert(op2.insert);
        op2 = ops2[i2++];
      } else if (op1.retain && op2.retain) {
        // Simple case: retain/retain
        operation1prime.retain(minl);
        operation2prime.retain(minl);
        if (op1l > op2l) {
          op1 = { retain: op1l - op2l };
          op2 = ops2[i2++];
        } else if (op1l === op2l) {
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          op1 = ops1[i1++];
          op2 = { retain: op2l - op1l };
        }
      } else if (op1.delete && op2.delete) {
        // Both operations delete the same string at the same position. We don't
        // need to produce any operations, we just skip over the delete ops and
        // handle the case that one operation deletes more than the other.
        if (op1l > op2l) {
          op1 = { delete: op1.delete - op2l };
          op2 = ops2[i2++];
        } else if (op1l === op2l) {
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          op1 = ops1[i1++];
          op2 = { delete: op2.delete - op1l };
        }
      // next two cases: delete/retain and retain/delete
      } else if (op1.delete && op2.retain) {
        operation1prime.delete(minl);
        if (op1l > op2l) {
          op1 = { delete: op1.delete - op2l };
          op2 = ops2[i2++];
        } else if (op1l === op2l) {
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          op1 = ops1[i1++];
          op2 = { retain: op2.retain - op1l };
        }
      } else if (op1.retain && op2.delete) {
        operation2prime.delete(minl);
        if (op1l > op2l) {
          op1 = { retain: op1.retain - op2l };
          op2 = ops2[i2++];
        } else if (op1l === op2l) {
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          op1 = ops1[i1++];
          op2 = { delete: op2.delete - op1l };
        }
      } else {
        throw new Error("The two operations aren't compatible");
      }
    }
    return [operation1prime, operation2prime];
  };

  // Expects the first argument to be truthy. Raises an error otherwise.
  function assert (b, msg) {
    if (!b) {
      throw new Error(msg || "assertion error");
    }
  }

  // Pick a random integer uniformally from the interval [0;n[
  function randomInt (n) {
    return Math.floor(Math.random() * n);
  }

  // Generate a random ID consisting of 16 hex digits.
  function randomID () {
    var id = '';
    var n = 16;
    while (n--) {
      id += randomInt(16).toString(16);
    }
    return id;
  }

  return Operation;

})();

// Export for CommonJS
if (typeof module === 'object') {
  module.exports = ot.Operation;
}