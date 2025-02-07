var AttributedString = (function() {
  function AttributedString(s, attr) {
    if (typeof s === "object" && typeof s.text === "string") {
      attr = s.attr;
      s = s.text;
    }
    this.text = s;
    this.attr = attr;
    this.length = s.length;
    for (var fn of ["lastIndexOf", "indexOf"]) {
      this[fn] = this.text[fn].bind(this.text);
    }
  }
  AttributedString.prototype.toString = function() { return this.text; };
  AttributedString.prototype.getAttribute = function() { return this.attr; };
  AttributedString.prototype.replace = function() {
    var args = Array.from(arguments);
    var result = this.text.replace.apply(this.text, args);
    return new AttributedString(result, this.attr);
  };
  AttributedString.prototype.toJSON = function() {
    return {
      "text": this.text,
      "attr": this.attr
    };
  };
  return AttributedString;
})();

var StringBuilder = (function () {
  function StringBuilder(s) {
    var init = typeof s === "string" || s;
    if (init) s = s instanceof AttributedString ? s : s.toString();
    this.backing = init ? [s] : [];
    this.len = init ? s.length : 0;
    var nl = init ? s.lastIndexOf("\n") : -1;
    this.col = init ? s.length - nl - 1 : 0;
    this.baseCol = 0;
    this.inline = nl < 0;
  }
  StringBuilder.prototype.append = function (s, attrOpt) {
    if (s instanceof Array) {
      for (var sub of s) this.append(sub, attrOpt);
      return this;
    }
    if (s instanceof StringBuilder) {
      if (s.backing.length < 32)
        this.backing.push.apply(this.backing, s.backing);
      else
        this.backing = this.backing.concat(s.backing);
      this.len += s.len;
      this.col = (s.inline ? this.col : 0) + s.col;
      if (this.inline) this.inline = s.inline;
      if (!s.inline) this.baseCol = 0;
      return this;
    }
    var str = s instanceof AttributedString ? s : s.toString();
    if (attrOpt) str = new AttributedString(s, attrOpt);
    this.backing.push(str);
    this.len += str.length;
    var nl = str.lastIndexOf("\n");
    if (nl < 0) {
      this.col += str.length;
    } else {
      this.col = str.length - nl - 1;
      this.baseCol = 0;
      this.inline = false;
    }
    return this;
  };
  StringBuilder.prototype.toString = StringBuilder.prototype.build = function () {
    var flat = this.backing.join("");
    if (this.backing.length > 1)
      this.backing = [flat];
    return flat;
  };
  StringBuilder.prototype.getSections = function() { return this.backing.slice(); };
  StringBuilder.prototype.getLength = function () { return this.len; };
  StringBuilder.prototype.getColumn = function () { return this.col + this.baseCol; };
  StringBuilder.prototype.setBaseColumn = function (val) { this.baseCol = val | 0; };
  return StringBuilder;
})();

/**
 * Generates a json string with advanced formatting options.
 * 
 * @param {*} val  a value of JSON encodable type
 * @param {object*} opts format options (optional parameter)
 * 
 * Format options are format customizations and some formatting parameters.
 * Format customizations are:
 * - objectOpen: the string to use to start an object literal (default: "{ ")
 * - objectClose: the string to use to end an object literal (default: " }")
 * - objectComma: the comma between object properties (default: ",")
 * - objectPaddedColon: space padded separator between object property key and value (defualt: ": ")
 * - arrayOpen: the string to use to start an array literal (default: "[ ")
 * - arrayClose: the string to use to end an array literal (default: " ]")
 * - arrayComma: the comma to use in an array literal (default: ",")
 * - indent: the string to repeat for indentation (overrides indentCharacter and indentWidth,
 *    the default is no override)
 * 
 * Format customization names will appear in the attributed string result (if attributed
 * string result is requested). The rest of the attributes are:
 * - key: object literal key
 * - padding: non-indenting whitespace
 * - null: the null value
 * - boolean: boolean value
 * - number: number value
 * 
 * Formatting parameters:
 * - indentCharacter: the character to use to indent (default is a single U+0020 character)
 * - indentWidth: the number of times indentCharacter has to be repeated (default is 2)
 * - scalarEncoder: a custom function to encode simple values: strings, numbers, booleans, nulls
 *   (default is JSON.stringify)
 * - keyEncoder: a custom function to encode object keys (the default is to use scalarEncoder)
 * - width: the number of columns to try to fit the JSON in (the default is to break whenever possible,
 *   however the formatter will never break between object keys and values)
 * - wantAttributed: return an array of AttributedStrings instead of a plain string value
 * - breakComplex: always break objects and arrays that contain at least one object or array value
 * - sortKeys: an object that describes how the object keys should be sorted
 *    - by: valid values are an array of "name" (sort by property name), "complexity" (sort by complexity),
 *      or empty to disable sorting
 */
function formatJson(val, opts) {
  opts = opts || {};
  var sortKeys = opts.sortKeys || {by: []};
  var objectOpen = new AttributedString(opts.objectOpen || "{", "objectOpen");
  var objectClose = new AttributedString(opts.objectClose || "}", "objectClose");
  var arrayOpen = new AttributedString(opts.arrayOpen || "[", "arrayOpen");
  var arrayClose = new AttributedString(opts.arrayClose || "]", "arrayClose");
  var objectComma = new AttributedString(opts.objectComma || ",", "objectComma");
  var objectPaddedColon = new AttributedString(opts.objectPaddedColon || ": ", "objectPaddedColon");
  var arrayComma = new AttributedString(opts.arrayComma || ",", "arrayComma");
  var indentCharacter = opts.indentCharacter || " ";
  var indentWidth = opts.indentWidth || (indentCharacter === " " ? 2 : 1);
  var indentSpaces = new AttributedString(opts.indent ||
    Array(indentWidth).fill(indentCharacter).join(""), "indent");
  var scalarEncoder = opts.scalarEncoder || JSON.stringify;
  var keyEncoder = opts.keyEncoder || scalarEncoder;
  var width = opts.width || null;
  var wantAttributed = opts.wantAttributed || false;
  var breakComplex = opts.breakComplex || false;
  var objectDepth = 0;
  var indentDepth = 0;
  var format = (e, breaksAllowed, builder) => {
    builder = builder || new StringBuilder();
    var objectFormatter = null;
    if (e && typeof e === "object") {
      var arr = e instanceof Array;
      var keys = arr ? null : Object.keys(e);
      if (keys && sortKeys && sortKeys.by && sortKeys.by.length > 0) {
        keys.sort((a, b) => {
          var complexity = a => a instanceof Array ? 2 : (a && typeof a === "object" ? 1 : 0);
          for (var aspect of sortKeys.by) {
            var diff = null;
            switch(aspect) {
              case "name":
                diff = a.localeCompare(b);
                break;
              case "complexity":
                diff = complexity(e[a]) - complexity(e[b]);
                break;
            }
            if (typeof diff === "number" && diff !== 0) return diff;
          }
          return 0;
        });
      }
      var items = arr ? e : keys;
      objectFormatter = (e, breaksAllowed) => {
        var padding = breaksAllowed
            ? [
                new AttributedString("\n", "padding"),
                new AttributedString(Array(indentDepth + 1).fill(indentSpaces).join(""), "indent")
              ]
            : new AttributedString(" ", "padding");
        var sub = new StringBuilder();
        sub.setBaseColumn(builder.getColumn());
        sub.append(arr ? arrayOpen : objectOpen);
        if (breaksAllowed) sub.append(padding);
        var l = sub.getLength();
        for (var item of items) {
          var obj = arr ? item : e[item];
          if (sub.getLength() > l) sub.append(arr ? arrayComma : objectComma).append(padding);
          if (!arr) {
            sub.append(keyEncoder(item), "key");
            sub.append(objectPaddedColon);
          }
          if (breaksAllowed) ++indentDepth;
          ++objectDepth;
          var objs = format(obj, breaksAllowed, sub);
          --objectDepth;
          if (breaksAllowed) --indentDepth;
          if (objs === null) return null;
          if (!breaksAllowed && sub.getColumn() >= width) return null;
        }
        if (breaksAllowed) {
          var p = padding;
          if (p instanceof Array) {
            p = p.slice();
            p[1] = p[1].replace(new RegExp(indentSpaces + "$"), "");
          }
          sub.append(p);
        }
        sub.append(arr ? arrayClose : objectClose);
        if (!breaksAllowed && sub.getColumn() >= width) return null;
        return sub;
      };
      if (arr && e.length === 0) {
        builder.append(arrayOpen).append(arrayClose);
      } else if (!arr && keys.length === 0) {
        builder.append(objectOpen).append(objectClose);
      } else {
        var s = null;
        var breakAnyway = false;
        if (breakComplex) {
          for (var item of items) {
            var obj = arr ? item : e[item];
            if (obj && typeof obj === "object") {
              breakAnyway = true;
              break;
            }
          }
        } else {
          breakAnyway = false;
        }
        if (!breakAnyway && breaksAllowed && width !== null) s = objectFormatter(e, false);
        if (s === null) s = objectFormatter(e, breaksAllowed);
        if (s === null) return null;
        builder.append(s);
      }
    } else builder.append(scalarEncoder(e), e === null ? "null" : typeof e);
    return builder;
  };
  var result = format(val, true);
  if (wantAttributed) return result.getSections();
  return result.build();
}

var AsyncFormatter = (function() {
  const ownUrl = this && this.document && this.document.currentScript && this.document.currentScript.src;
  function AsyncFormatter(pathOpt) {
    pathOpt = pathOpt || ownUrl || "./format.js";
    this.worker = new Worker(pathOpt);
    this.callCounter = 0;
    this.reg = {};
    this.onbeforecallback = () => {};
    this.pending = 0;
    var that = this;
    this.worker.onmessage = (e) => {
      var rel = e.data;
      var cb = that.reg[rel.id];
      --that.pending;
      that.onbeforecallback();
      delete that.reg[rel.id];
      if (rel.error) {
        if (cb) {
          cb.error(rel.error);
        } else {
          console.error(rel.error);
        }
      } else {
        if (cb) cb.success(rel.formatted);
      }
    };
  }

  AsyncFormatter.prototype.formatJson = function (rawJson, opts, format) {
    ++this.pending;
    var cc = (++this.callCounter).toString(16);
    var that = this;
    return new Promise((resolve, reject) => {
      that.reg[cc] = {
        error: e => reject(e),
        success: e => resolve(e)
      };
      that.worker.postMessage({id: cc, json: rawJson, opts: opts, format: format});
    });
  }

  return AsyncFormatter;
})();

if (!this.document) {
  // we are in a worker
  var self = this;
  (function() {
    self.onmessage = (e) => {
      var rel = e.data;
      try {
        var format = rel.format;
        var formatter = formatJson;
        if (format) {
          if (format.dartString) rel.opts.scalarEncoder = (e) => {
            var v = JSON.stringify(e);
            if (typeof e !== "string") return v;
            return v.replace(/\$/g, "\\$");
          };
          if (format.dartConst) {
            rel.opts.objectOpen = "const {";
            rel.opts.arrayOpen = "const [";
          }
          if (format.jsNoKeyQuotes) rel.opts.keyEncoder = (e) => {
            if (!/^[$a-zA-Z0-9]+$/.test(e)) return JSON.stringify(e);
            return e;
          };
          if (format.objectDump) {
            rel.json = "["+rel.json.split(/\n+/g).filter(e => !/^\s*$/.test(e)).join(",")+"]";
            var prevFormatter = formatter;
            formatter = (items, opts) => {
              if (!(items instanceof Array)) return prevFormatter(items, opts);
              var result = items.map(e => prevFormatter(e, opts));
              if (result.length > 0 && result[0] instanceof Array) {
                var objectSeparator = new AttributedString("\n", "objectSeparator");
                return Array.prototype.concat.apply([], result.map((e, i, a) => {
                  if (i < a.length - 1 && e[e.length - 1] !== objectSeparator) e.push(objectSeparator);
                  return e;
                }));
              } else {
                return result.join("\n");
              }
            }
          }
        }
        var result = formatter(JSON.parse(rel.json), rel.opts);
        if (result instanceof Array) result = result.map(e => e.toJSON ? e.toJSON() : e);
        self.postMessage({
          id: rel.id,
          formatted: result
        });
      } catch (e) {
        console.error(e);
        self.postMessage({
          id: rel.id,
          error: e.toString()
        });
      }
    };
  })();
}
