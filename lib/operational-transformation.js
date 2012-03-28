var operational_transformation = (function () {

  function Operation (revision, id, ops) {
    assert(
      typeof revision === 'number' && revision >= 0,
      "the first parameter to the the parent revision number of the document"
    );
    this.revision = revision;
    this.id = id || randomID();
    assert(this.id && typeof this.id === 'string', "not a valid id: " + this.id);
    this.ops = ops || [];
    this.baseLength = 0;
    this.targetLength = 0;
  }

  Operation.prototype.retain = function (n) {
    assert(typeof n === 'number' && n >= 0);
    if (n === 0) { return this; }
    this.baseLength += n;
    this.targetLength += n;
    var lastOp = this.ops[this.ops.length-1];
    if (lastOp && lastOp.retain) {
      lastOp.retain += n;
    } else {
      this.ops.push({ retain: n });
    }
    return this;
  };

  Operation.prototype.insert = function (str) {
    assert(typeof str === 'string');
    if (str === '') { return this; }
    this.targetLength += str.length;
    var lastOp = this.ops[this.ops.length-1];
    if (lastOp && lastOp.insert) {
      lastOp.insert += str;
    } else {
      this.ops.push({ insert: str });
    }
    return this;
  };

  Operation.prototype.delete = function (str) {
    assert(typeof str === 'string');
    if (str === '') { return this; }
    this.baseLength += str.length;
    var lastOp = this.ops[this.ops.length-1];
    if (lastOp && lastOp.delete) {
      lastOp.delete += str;
    } else {
      this.ops.push({ delete: str });
    }
    return this;
  };

  Operation.prototype.toString = function () {
    var map = Array.prototype.map || function (fn) {
      var arr = this;
      var newArr = [];
      for (var i = 0, l = arr.length; i < l; i++) {
        newArr[i] = fn(arr[i]);
      }
      return newArr;
    }
    return map.call(this.ops, function (op) {
      return op.retain
             ? "retain " + op.retain
             : (op.insert
                ? "insert '" + op.insert + "'"
                : "delete '" + op.delete + "'")
    }).join(', ');
  };

  Operation.fromJSON = function (obj) {
    assert(obj.id);
    var o = new Operation(obj.revision, obj.id);
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
    assert(o.baseLength === obj.baseLength);
    assert(o.targetLength === obj.targetLength);
    return o;
  };

  function apply (str, operation) {
    if (str.length !== operation.baseLength) {
      throw new Error("The operation's base length must be equal to the string's length.");
    }
    var newStr = [], j = 0;
    var strIndex = 0;
    var ops = operation.ops;
    for (var i = 0, l = ops.length; i < l; i++) {
      var op = ops[i];
      if (op.retain) {
        if (strIndex + op.retain > str.length) {
          throw new Error("Operation can't retain more characters than are left in the string.");
        }
        newStr[j++] = str.slice(strIndex, strIndex + op.retain);
        strIndex += op.retain;
      } else if (op.insert) {
        newStr[j++] = op.insert;
      } else { // delete op
        if (op.delete !== str.slice(strIndex, strIndex + op.delete.length)) {
          throw new Error("The deleted string and the next characters in the string don't match.");
        }
        strIndex += op.delete.length;
      }
    }
    if (strIndex !== str.length) {
      throw new Error("The operation didn't operate on the whole string.");
    }
    return newStr.join('');
  }

  function compose (operation1, operation2) {
    if (operation1.targetLength !== operation2.baseLength) {
      throw new Error("The base length of the second operation has two be the target length of the first operation");
    }
    if (operation1.revision + 1 !== operation2.revision) {
      throw new Error("The second operations revision must be one more than the first operations revision");
    }
    var operation = new Operation(operation1.revision);
    var ops1 = operation1.ops, ops2 = operation2.ops;
    var i1 = 0, i2 = 0;
    var op1 = ops1[i1++], op2 = ops2[i2++];
    while (true) {
      var op1l = op1 && (op1.retain || (op1.insert || op1.delete).length);
      var op2l = op2 && (op2.retain || (op2.insert || op2.delete).length);
      var minl = Math.min(op1l, op2l);
      if (typeof op1 === 'undefined' && typeof op2 === 'undefined') {
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
        if (op1l > op2l) {
          operation.retain(op2l);
          op1 = { retain: op1l - op2l };
          op2 = ops2[i2++];
        } else if (op1l === op2l) {
          operation.retain(op1l);
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          operation.retain(op1l);
          op1 = ops1[i1++];
          op2 = { retain: op2l - op1l };
        }
      } else if (op1.insert && op2.delete) {
        if (op1.insert.slice(0, minl) !== op2.delete.slice(0, minl)) {
          throw new Error("Successive operations must delete what has been inserted before.");
        }
        if (op1l > op2l) {
          op1 = { insert: op1.insert.slice(op2l) };
          op2 = ops2[i2++];
        } else if (op1l === op2l) {
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          op1 = ops1[i1++];
          op2 = { delete: op2.delete.slice(op1l) };
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
          operation.delete(op2.delete.slice(0, op1l));
          op1 = ops1[i1++];
          op2 = { delete: op2.delete.slice(op1l) };
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
  }

  function transform (operation1, operation2) {
    if (operation1.baseLength !== operation2.baseLength) {
      throw new Error("Both operations have to have the same base length");
    }
    if (operation1.revision !== operation2.revision) {
      throw new Error("Both operations have to have the same revision");
    }
    var operation1prime = new Operation(operation2.revision + 1, operation1.id);
    var operation2prime = new Operation(operation1.revision + 1, operation2.id);
    var ops1 = operation1.ops, ops2 = operation2.ops;
    var i1 = 0, i2 = 0;
    var op1 = ops1[i1++], op2 = ops2[i2++];
    while (true) {
      var op1l = op1 && (op1.retain || (op1.insert || op1.delete).length);
      var op2l = op2 && (op2.retain || (op2.insert || op2.delete).length);
      var minl = Math.min(op1l, op2l);
      if (typeof op1 === 'undefined' && typeof op2 === 'undefined') {
        break;
      } else if (op1 && op1.insert) {
        operation1prime.insert(op1.insert);
        operation2prime.retain(op1.insert.length);
        op1 = ops1[i1++];
      } else if (op2 && op2.insert) {
        operation1prime.retain(op2.insert.length);
        operation2prime.insert(op2.insert);
        op2 = ops2[i2++];
      } else if (op1.retain && op2.retain) {
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
        if (op1.delete.slice(0, minl) !== op2.delete.slice(0, minl)) {
          throw new Error("When two concurrent operations delete text at the same position, they must delete the same text");
        }
        if (op1l > op2l) {
          op1 = { delete: op1.delete.slice(op2l) };
          op2 = ops2[i2++];
        } else if (op1l === op2l) {
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          op1 = ops1[i1++];
          op2 = { delete: op2.delete.slice(op1l) };
        }
      } else if (op1.delete && op2.retain) {
        operation1prime.delete(op1.delete.slice(0, minl));
        if (op1l > op2l) {
          op1 = { delete: op1.delete.slice(op2l) };
          op2 = ops2[i2++];
        } else if (op1l === op2l) {
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          op1 = ops1[i1++];
          op2 = { retain: op2.retain - op1l };
        }
      } else if (op1.retain && op2.delete) {
        operation2prime.delete(op2.delete.slice(0, minl));
        if (op1l > op2l) {
          op1 = { retain: op1.retain - op2l };
          op2 = ops2[i2++];
        } else if (op1l === op2l) {
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          op1 = ops1[i1++];
          op2 = { delete: op2.delete.slice(op1l) };
        }
      } else {
        throw new Error("The two operations aren't compatible");
      }
    }
    return [operation1prime, operation2prime];
  }

  function assert (b, msg) {
    if (!b) {
      throw new Error(msg || "assertion error");
    }
  }

  function randomInt (n) {
    return Math.floor(Math.random() * n);
  }

  function randomID () {
    var id = '';
    var n = 16;
    while (n--) {
      id += randomInt(16).toString(16);
    }
    return id;
  }

  return {
    Operation: Operation,
    apply: apply,
    compose: compose,
    transform: transform
  };

})();

if (typeof module === 'object') {
  module.exports = operational_transformation;
}