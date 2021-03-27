import {randomBytes, createHash} from "crypto";
import http from "http";
import https from "https";
import zlib from "zlib";
import Stream, {PassThrough, pipeline} from "stream";
import {types} from "util";
import {format, parse, resolve, URLSearchParams as URLSearchParams$1} from "url";
import PrismicDom from "prismic-dom";
import Prismic from "@prismicio/client";
var chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$";
var unsafeChars = /[<>\b\f\n\r\t\0\u2028\u2029]/g;
var reserved = /^(?:do|if|in|for|int|let|new|try|var|byte|case|char|else|enum|goto|long|this|void|with|await|break|catch|class|const|final|float|short|super|throw|while|yield|delete|double|export|import|native|return|switch|throws|typeof|boolean|default|extends|finally|package|private|abstract|continue|debugger|function|volatile|interface|protected|transient|implements|instanceof|synchronized)$/;
var escaped$1 = {
  "<": "\\u003C",
  ">": "\\u003E",
  "/": "\\u002F",
  "\\": "\\\\",
  "\b": "\\b",
  "\f": "\\f",
  "\n": "\\n",
  "\r": "\\r",
  "	": "\\t",
  "\0": "\\0",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029"
};
var objectProtoOwnPropertyNames = Object.getOwnPropertyNames(Object.prototype).sort().join("\0");
function devalue(value) {
  var counts = new Map();
  function walk(thing) {
    if (typeof thing === "function") {
      throw new Error("Cannot stringify a function");
    }
    if (counts.has(thing)) {
      counts.set(thing, counts.get(thing) + 1);
      return;
    }
    counts.set(thing, 1);
    if (!isPrimitive(thing)) {
      var type = getType(thing);
      switch (type) {
        case "Number":
        case "String":
        case "Boolean":
        case "Date":
        case "RegExp":
          return;
        case "Array":
          thing.forEach(walk);
          break;
        case "Set":
        case "Map":
          Array.from(thing).forEach(walk);
          break;
        default:
          var proto = Object.getPrototypeOf(thing);
          if (proto !== Object.prototype && proto !== null && Object.getOwnPropertyNames(proto).sort().join("\0") !== objectProtoOwnPropertyNames) {
            throw new Error("Cannot stringify arbitrary non-POJOs");
          }
          if (Object.getOwnPropertySymbols(thing).length > 0) {
            throw new Error("Cannot stringify POJOs with symbolic keys");
          }
          Object.keys(thing).forEach(function(key) {
            return walk(thing[key]);
          });
      }
    }
  }
  walk(value);
  var names = new Map();
  Array.from(counts).filter(function(entry) {
    return entry[1] > 1;
  }).sort(function(a, b) {
    return b[1] - a[1];
  }).forEach(function(entry, i) {
    names.set(entry[0], getName(i));
  });
  function stringify(thing) {
    if (names.has(thing)) {
      return names.get(thing);
    }
    if (isPrimitive(thing)) {
      return stringifyPrimitive(thing);
    }
    var type = getType(thing);
    switch (type) {
      case "Number":
      case "String":
      case "Boolean":
        return "Object(" + stringify(thing.valueOf()) + ")";
      case "RegExp":
        return "new RegExp(" + stringifyString(thing.source) + ', "' + thing.flags + '")';
      case "Date":
        return "new Date(" + thing.getTime() + ")";
      case "Array":
        var members = thing.map(function(v, i) {
          return i in thing ? stringify(v) : "";
        });
        var tail = thing.length === 0 || thing.length - 1 in thing ? "" : ",";
        return "[" + members.join(",") + tail + "]";
      case "Set":
      case "Map":
        return "new " + type + "([" + Array.from(thing).map(stringify).join(",") + "])";
      default:
        var obj = "{" + Object.keys(thing).map(function(key) {
          return safeKey(key) + ":" + stringify(thing[key]);
        }).join(",") + "}";
        var proto = Object.getPrototypeOf(thing);
        if (proto === null) {
          return Object.keys(thing).length > 0 ? "Object.assign(Object.create(null)," + obj + ")" : "Object.create(null)";
        }
        return obj;
    }
  }
  var str = stringify(value);
  if (names.size) {
    var params_1 = [];
    var statements_1 = [];
    var values_1 = [];
    names.forEach(function(name, thing) {
      params_1.push(name);
      if (isPrimitive(thing)) {
        values_1.push(stringifyPrimitive(thing));
        return;
      }
      var type = getType(thing);
      switch (type) {
        case "Number":
        case "String":
        case "Boolean":
          values_1.push("Object(" + stringify(thing.valueOf()) + ")");
          break;
        case "RegExp":
          values_1.push(thing.toString());
          break;
        case "Date":
          values_1.push("new Date(" + thing.getTime() + ")");
          break;
        case "Array":
          values_1.push("Array(" + thing.length + ")");
          thing.forEach(function(v, i) {
            statements_1.push(name + "[" + i + "]=" + stringify(v));
          });
          break;
        case "Set":
          values_1.push("new Set");
          statements_1.push(name + "." + Array.from(thing).map(function(v) {
            return "add(" + stringify(v) + ")";
          }).join("."));
          break;
        case "Map":
          values_1.push("new Map");
          statements_1.push(name + "." + Array.from(thing).map(function(_a) {
            var k = _a[0], v = _a[1];
            return "set(" + stringify(k) + ", " + stringify(v) + ")";
          }).join("."));
          break;
        default:
          values_1.push(Object.getPrototypeOf(thing) === null ? "Object.create(null)" : "{}");
          Object.keys(thing).forEach(function(key) {
            statements_1.push("" + name + safeProp(key) + "=" + stringify(thing[key]));
          });
      }
    });
    statements_1.push("return " + str);
    return "(function(" + params_1.join(",") + "){" + statements_1.join(";") + "}(" + values_1.join(",") + "))";
  } else {
    return str;
  }
}
function getName(num) {
  var name = "";
  do {
    name = chars[num % chars.length] + name;
    num = ~~(num / chars.length) - 1;
  } while (num >= 0);
  return reserved.test(name) ? name + "_" : name;
}
function isPrimitive(thing) {
  return Object(thing) !== thing;
}
function stringifyPrimitive(thing) {
  if (typeof thing === "string")
    return stringifyString(thing);
  if (thing === void 0)
    return "void 0";
  if (thing === 0 && 1 / thing < 0)
    return "-0";
  var str = String(thing);
  if (typeof thing === "number")
    return str.replace(/^(-)?0\./, "$1.");
  return str;
}
function getType(thing) {
  return Object.prototype.toString.call(thing).slice(8, -1);
}
function escapeUnsafeChar(c) {
  return escaped$1[c] || c;
}
function escapeUnsafeChars(str) {
  return str.replace(unsafeChars, escapeUnsafeChar);
}
function safeKey(key) {
  return /^[_$a-zA-Z][_$a-zA-Z0-9]*$/.test(key) ? key : escapeUnsafeChars(JSON.stringify(key));
}
function safeProp(key) {
  return /^[_$a-zA-Z][_$a-zA-Z0-9]*$/.test(key) ? "." + key : "[" + escapeUnsafeChars(JSON.stringify(key)) + "]";
}
function stringifyString(str) {
  var result = '"';
  for (var i = 0; i < str.length; i += 1) {
    var char = str.charAt(i);
    var code = char.charCodeAt(0);
    if (char === '"') {
      result += '\\"';
    } else if (char in escaped$1) {
      result += escaped$1[char];
    } else if (code >= 55296 && code <= 57343) {
      var next = str.charCodeAt(i + 1);
      if (code <= 56319 && (next >= 56320 && next <= 57343)) {
        result += char + str[++i];
      } else {
        result += "\\u" + code.toString(16).toUpperCase();
      }
    } else {
      result += char;
    }
  }
  result += '"';
  return result;
}
function dataUriToBuffer(uri) {
  if (!/^data:/i.test(uri)) {
    throw new TypeError('`uri` does not appear to be a Data URI (must begin with "data:")');
  }
  uri = uri.replace(/\r?\n/g, "");
  const firstComma = uri.indexOf(",");
  if (firstComma === -1 || firstComma <= 4) {
    throw new TypeError("malformed data: URI");
  }
  const meta = uri.substring(5, firstComma).split(";");
  let charset = "";
  let base64 = false;
  const type = meta[0] || "text/plain";
  let typeFull = type;
  for (let i = 1; i < meta.length; i++) {
    if (meta[i] === "base64") {
      base64 = true;
    } else {
      typeFull += `;${meta[i]}`;
      if (meta[i].indexOf("charset=") === 0) {
        charset = meta[i].substring(8);
      }
    }
  }
  if (!meta[0] && !charset.length) {
    typeFull += ";charset=US-ASCII";
    charset = "US-ASCII";
  }
  const encoding = base64 ? "base64" : "ascii";
  const data = unescape(uri.substring(firstComma + 1));
  const buffer = Buffer.from(data, encoding);
  buffer.type = type;
  buffer.typeFull = typeFull;
  buffer.charset = charset;
  return buffer;
}
var src = dataUriToBuffer;
const {Readable} = Stream;
const wm = new WeakMap();
async function* read(parts) {
  for (const part of parts) {
    if ("stream" in part) {
      yield* part.stream();
    } else {
      yield part;
    }
  }
}
class Blob {
  constructor(blobParts = [], options2 = {type: ""}) {
    let size = 0;
    const parts = blobParts.map((element) => {
      let buffer;
      if (element instanceof Buffer) {
        buffer = element;
      } else if (ArrayBuffer.isView(element)) {
        buffer = Buffer.from(element.buffer, element.byteOffset, element.byteLength);
      } else if (element instanceof ArrayBuffer) {
        buffer = Buffer.from(element);
      } else if (element instanceof Blob) {
        buffer = element;
      } else {
        buffer = Buffer.from(typeof element === "string" ? element : String(element));
      }
      size += buffer.length || buffer.size || 0;
      return buffer;
    });
    const type = options2.type === void 0 ? "" : String(options2.type).toLowerCase();
    wm.set(this, {
      type: /[^\u0020-\u007E]/.test(type) ? "" : type,
      size,
      parts
    });
  }
  get size() {
    return wm.get(this).size;
  }
  get type() {
    return wm.get(this).type;
  }
  async text() {
    return Buffer.from(await this.arrayBuffer()).toString();
  }
  async arrayBuffer() {
    const data = new Uint8Array(this.size);
    let offset = 0;
    for await (const chunk of this.stream()) {
      data.set(chunk, offset);
      offset += chunk.length;
    }
    return data.buffer;
  }
  stream() {
    return Readable.from(read(wm.get(this).parts));
  }
  slice(start = 0, end = this.size, type = "") {
    const {size} = this;
    let relativeStart = start < 0 ? Math.max(size + start, 0) : Math.min(start, size);
    let relativeEnd = end < 0 ? Math.max(size + end, 0) : Math.min(end, size);
    const span = Math.max(relativeEnd - relativeStart, 0);
    const parts = wm.get(this).parts.values();
    const blobParts = [];
    let added = 0;
    for (const part of parts) {
      const size2 = ArrayBuffer.isView(part) ? part.byteLength : part.size;
      if (relativeStart && size2 <= relativeStart) {
        relativeStart -= size2;
        relativeEnd -= size2;
      } else {
        const chunk = part.slice(relativeStart, Math.min(size2, relativeEnd));
        blobParts.push(chunk);
        added += ArrayBuffer.isView(chunk) ? chunk.byteLength : chunk.size;
        relativeStart = 0;
        if (added >= span) {
          break;
        }
      }
    }
    const blob = new Blob([], {type});
    Object.assign(wm.get(blob), {size: span, parts: blobParts});
    return blob;
  }
  get [Symbol.toStringTag]() {
    return "Blob";
  }
  static [Symbol.hasInstance](object) {
    return typeof object === "object" && typeof object.stream === "function" && object.stream.length === 0 && typeof object.constructor === "function" && /^(Blob|File)$/.test(object[Symbol.toStringTag]);
  }
}
Object.defineProperties(Blob.prototype, {
  size: {enumerable: true},
  type: {enumerable: true},
  slice: {enumerable: true}
});
var fetchBlob = Blob;
class FetchBaseError extends Error {
  constructor(message, type) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
    this.type = type;
  }
  get name() {
    return this.constructor.name;
  }
  get [Symbol.toStringTag]() {
    return this.constructor.name;
  }
}
class FetchError extends FetchBaseError {
  constructor(message, type, systemError) {
    super(message, type);
    if (systemError) {
      this.code = this.errno = systemError.code;
      this.erroredSysCall = systemError.syscall;
    }
  }
}
const NAME = Symbol.toStringTag;
const isURLSearchParameters = (object) => {
  return typeof object === "object" && typeof object.append === "function" && typeof object.delete === "function" && typeof object.get === "function" && typeof object.getAll === "function" && typeof object.has === "function" && typeof object.set === "function" && typeof object.sort === "function" && object[NAME] === "URLSearchParams";
};
const isBlob = (object) => {
  return typeof object === "object" && typeof object.arrayBuffer === "function" && typeof object.type === "string" && typeof object.stream === "function" && typeof object.constructor === "function" && /^(Blob|File)$/.test(object[NAME]);
};
function isFormData(object) {
  return typeof object === "object" && typeof object.append === "function" && typeof object.set === "function" && typeof object.get === "function" && typeof object.getAll === "function" && typeof object.delete === "function" && typeof object.keys === "function" && typeof object.values === "function" && typeof object.entries === "function" && typeof object.constructor === "function" && object[NAME] === "FormData";
}
const isAbortSignal = (object) => {
  return typeof object === "object" && object[NAME] === "AbortSignal";
};
const carriage = "\r\n";
const dashes = "-".repeat(2);
const carriageLength = Buffer.byteLength(carriage);
const getFooter = (boundary) => `${dashes}${boundary}${dashes}${carriage.repeat(2)}`;
function getHeader(boundary, name, field) {
  let header = "";
  header += `${dashes}${boundary}${carriage}`;
  header += `Content-Disposition: form-data; name="${name}"`;
  if (isBlob(field)) {
    header += `; filename="${field.name}"${carriage}`;
    header += `Content-Type: ${field.type || "application/octet-stream"}`;
  }
  return `${header}${carriage.repeat(2)}`;
}
const getBoundary = () => randomBytes(8).toString("hex");
async function* formDataIterator(form, boundary) {
  for (const [name, value] of form) {
    yield getHeader(boundary, name, value);
    if (isBlob(value)) {
      yield* value.stream();
    } else {
      yield value;
    }
    yield carriage;
  }
  yield getFooter(boundary);
}
function getFormDataLength(form, boundary) {
  let length = 0;
  for (const [name, value] of form) {
    length += Buffer.byteLength(getHeader(boundary, name, value));
    if (isBlob(value)) {
      length += value.size;
    } else {
      length += Buffer.byteLength(String(value));
    }
    length += carriageLength;
  }
  length += Buffer.byteLength(getFooter(boundary));
  return length;
}
const INTERNALS$2 = Symbol("Body internals");
class Body {
  constructor(body, {
    size = 0
  } = {}) {
    let boundary = null;
    if (body === null) {
      body = null;
    } else if (isURLSearchParameters(body)) {
      body = Buffer.from(body.toString());
    } else if (isBlob(body))
      ;
    else if (Buffer.isBuffer(body))
      ;
    else if (types.isAnyArrayBuffer(body)) {
      body = Buffer.from(body);
    } else if (ArrayBuffer.isView(body)) {
      body = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
    } else if (body instanceof Stream)
      ;
    else if (isFormData(body)) {
      boundary = `NodeFetchFormDataBoundary${getBoundary()}`;
      body = Stream.Readable.from(formDataIterator(body, boundary));
    } else {
      body = Buffer.from(String(body));
    }
    this[INTERNALS$2] = {
      body,
      boundary,
      disturbed: false,
      error: null
    };
    this.size = size;
    if (body instanceof Stream) {
      body.on("error", (err) => {
        const error2 = err instanceof FetchBaseError ? err : new FetchError(`Invalid response body while trying to fetch ${this.url}: ${err.message}`, "system", err);
        this[INTERNALS$2].error = error2;
      });
    }
  }
  get body() {
    return this[INTERNALS$2].body;
  }
  get bodyUsed() {
    return this[INTERNALS$2].disturbed;
  }
  async arrayBuffer() {
    const {buffer, byteOffset, byteLength} = await consumeBody(this);
    return buffer.slice(byteOffset, byteOffset + byteLength);
  }
  async blob() {
    const ct = this.headers && this.headers.get("content-type") || this[INTERNALS$2].body && this[INTERNALS$2].body.type || "";
    const buf = await this.buffer();
    return new fetchBlob([buf], {
      type: ct
    });
  }
  async json() {
    const buffer = await consumeBody(this);
    return JSON.parse(buffer.toString());
  }
  async text() {
    const buffer = await consumeBody(this);
    return buffer.toString();
  }
  buffer() {
    return consumeBody(this);
  }
}
Object.defineProperties(Body.prototype, {
  body: {enumerable: true},
  bodyUsed: {enumerable: true},
  arrayBuffer: {enumerable: true},
  blob: {enumerable: true},
  json: {enumerable: true},
  text: {enumerable: true}
});
async function consumeBody(data) {
  if (data[INTERNALS$2].disturbed) {
    throw new TypeError(`body used already for: ${data.url}`);
  }
  data[INTERNALS$2].disturbed = true;
  if (data[INTERNALS$2].error) {
    throw data[INTERNALS$2].error;
  }
  let {body} = data;
  if (body === null) {
    return Buffer.alloc(0);
  }
  if (isBlob(body)) {
    body = body.stream();
  }
  if (Buffer.isBuffer(body)) {
    return body;
  }
  if (!(body instanceof Stream)) {
    return Buffer.alloc(0);
  }
  const accum = [];
  let accumBytes = 0;
  try {
    for await (const chunk of body) {
      if (data.size > 0 && accumBytes + chunk.length > data.size) {
        const err = new FetchError(`content size at ${data.url} over limit: ${data.size}`, "max-size");
        body.destroy(err);
        throw err;
      }
      accumBytes += chunk.length;
      accum.push(chunk);
    }
  } catch (error2) {
    if (error2 instanceof FetchBaseError) {
      throw error2;
    } else {
      throw new FetchError(`Invalid response body while trying to fetch ${data.url}: ${error2.message}`, "system", error2);
    }
  }
  if (body.readableEnded === true || body._readableState.ended === true) {
    try {
      if (accum.every((c) => typeof c === "string")) {
        return Buffer.from(accum.join(""));
      }
      return Buffer.concat(accum, accumBytes);
    } catch (error2) {
      throw new FetchError(`Could not create Buffer from response body for ${data.url}: ${error2.message}`, "system", error2);
    }
  } else {
    throw new FetchError(`Premature close of server response while trying to fetch ${data.url}`);
  }
}
const clone = (instance, highWaterMark) => {
  let p1;
  let p2;
  let {body} = instance;
  if (instance.bodyUsed) {
    throw new Error("cannot clone body after it is used");
  }
  if (body instanceof Stream && typeof body.getBoundary !== "function") {
    p1 = new PassThrough({highWaterMark});
    p2 = new PassThrough({highWaterMark});
    body.pipe(p1);
    body.pipe(p2);
    instance[INTERNALS$2].body = p1;
    body = p2;
  }
  return body;
};
const extractContentType = (body, request) => {
  if (body === null) {
    return null;
  }
  if (typeof body === "string") {
    return "text/plain;charset=UTF-8";
  }
  if (isURLSearchParameters(body)) {
    return "application/x-www-form-urlencoded;charset=UTF-8";
  }
  if (isBlob(body)) {
    return body.type || null;
  }
  if (Buffer.isBuffer(body) || types.isAnyArrayBuffer(body) || ArrayBuffer.isView(body)) {
    return null;
  }
  if (body && typeof body.getBoundary === "function") {
    return `multipart/form-data;boundary=${body.getBoundary()}`;
  }
  if (isFormData(body)) {
    return `multipart/form-data; boundary=${request[INTERNALS$2].boundary}`;
  }
  if (body instanceof Stream) {
    return null;
  }
  return "text/plain;charset=UTF-8";
};
const getTotalBytes = (request) => {
  const {body} = request;
  if (body === null) {
    return 0;
  }
  if (isBlob(body)) {
    return body.size;
  }
  if (Buffer.isBuffer(body)) {
    return body.length;
  }
  if (body && typeof body.getLengthSync === "function") {
    return body.hasKnownLength && body.hasKnownLength() ? body.getLengthSync() : null;
  }
  if (isFormData(body)) {
    return getFormDataLength(request[INTERNALS$2].boundary);
  }
  return null;
};
const writeToStream = (dest, {body}) => {
  if (body === null) {
    dest.end();
  } else if (isBlob(body)) {
    body.stream().pipe(dest);
  } else if (Buffer.isBuffer(body)) {
    dest.write(body);
    dest.end();
  } else {
    body.pipe(dest);
  }
};
const validateHeaderName = typeof http.validateHeaderName === "function" ? http.validateHeaderName : (name) => {
  if (!/^[\^`\-\w!#$%&'*+.|~]+$/.test(name)) {
    const err = new TypeError(`Header name must be a valid HTTP token [${name}]`);
    Object.defineProperty(err, "code", {value: "ERR_INVALID_HTTP_TOKEN"});
    throw err;
  }
};
const validateHeaderValue = typeof http.validateHeaderValue === "function" ? http.validateHeaderValue : (name, value) => {
  if (/[^\t\u0020-\u007E\u0080-\u00FF]/.test(value)) {
    const err = new TypeError(`Invalid character in header content ["${name}"]`);
    Object.defineProperty(err, "code", {value: "ERR_INVALID_CHAR"});
    throw err;
  }
};
class Headers extends URLSearchParams {
  constructor(init2) {
    let result = [];
    if (init2 instanceof Headers) {
      const raw = init2.raw();
      for (const [name, values] of Object.entries(raw)) {
        result.push(...values.map((value) => [name, value]));
      }
    } else if (init2 == null)
      ;
    else if (typeof init2 === "object" && !types.isBoxedPrimitive(init2)) {
      const method = init2[Symbol.iterator];
      if (method == null) {
        result.push(...Object.entries(init2));
      } else {
        if (typeof method !== "function") {
          throw new TypeError("Header pairs must be iterable");
        }
        result = [...init2].map((pair) => {
          if (typeof pair !== "object" || types.isBoxedPrimitive(pair)) {
            throw new TypeError("Each header pair must be an iterable object");
          }
          return [...pair];
        }).map((pair) => {
          if (pair.length !== 2) {
            throw new TypeError("Each header pair must be a name/value tuple");
          }
          return [...pair];
        });
      }
    } else {
      throw new TypeError("Failed to construct 'Headers': The provided value is not of type '(sequence<sequence<ByteString>> or record<ByteString, ByteString>)");
    }
    result = result.length > 0 ? result.map(([name, value]) => {
      validateHeaderName(name);
      validateHeaderValue(name, String(value));
      return [String(name).toLowerCase(), String(value)];
    }) : void 0;
    super(result);
    return new Proxy(this, {
      get(target, p, receiver) {
        switch (p) {
          case "append":
          case "set":
            return (name, value) => {
              validateHeaderName(name);
              validateHeaderValue(name, String(value));
              return URLSearchParams.prototype[p].call(receiver, String(name).toLowerCase(), String(value));
            };
          case "delete":
          case "has":
          case "getAll":
            return (name) => {
              validateHeaderName(name);
              return URLSearchParams.prototype[p].call(receiver, String(name).toLowerCase());
            };
          case "keys":
            return () => {
              target.sort();
              return new Set(URLSearchParams.prototype.keys.call(target)).keys();
            };
          default:
            return Reflect.get(target, p, receiver);
        }
      }
    });
  }
  get [Symbol.toStringTag]() {
    return this.constructor.name;
  }
  toString() {
    return Object.prototype.toString.call(this);
  }
  get(name) {
    const values = this.getAll(name);
    if (values.length === 0) {
      return null;
    }
    let value = values.join(", ");
    if (/^content-encoding$/i.test(name)) {
      value = value.toLowerCase();
    }
    return value;
  }
  forEach(callback) {
    for (const name of this.keys()) {
      callback(this.get(name), name);
    }
  }
  *values() {
    for (const name of this.keys()) {
      yield this.get(name);
    }
  }
  *entries() {
    for (const name of this.keys()) {
      yield [name, this.get(name)];
    }
  }
  [Symbol.iterator]() {
    return this.entries();
  }
  raw() {
    return [...this.keys()].reduce((result, key) => {
      result[key] = this.getAll(key);
      return result;
    }, {});
  }
  [Symbol.for("nodejs.util.inspect.custom")]() {
    return [...this.keys()].reduce((result, key) => {
      const values = this.getAll(key);
      if (key === "host") {
        result[key] = values[0];
      } else {
        result[key] = values.length > 1 ? values : values[0];
      }
      return result;
    }, {});
  }
}
Object.defineProperties(Headers.prototype, ["get", "entries", "forEach", "values"].reduce((result, property) => {
  result[property] = {enumerable: true};
  return result;
}, {}));
function fromRawHeaders(headers = []) {
  return new Headers(headers.reduce((result, value, index2, array) => {
    if (index2 % 2 === 0) {
      result.push(array.slice(index2, index2 + 2));
    }
    return result;
  }, []).filter(([name, value]) => {
    try {
      validateHeaderName(name);
      validateHeaderValue(name, String(value));
      return true;
    } catch (e) {
      return false;
    }
  }));
}
const redirectStatus = new Set([301, 302, 303, 307, 308]);
const isRedirect = (code) => {
  return redirectStatus.has(code);
};
const INTERNALS$1 = Symbol("Response internals");
class Response extends Body {
  constructor(body = null, options2 = {}) {
    super(body, options2);
    const status = options2.status || 200;
    const headers = new Headers(options2.headers);
    if (body !== null && !headers.has("Content-Type")) {
      const contentType = extractContentType(body);
      if (contentType) {
        headers.append("Content-Type", contentType);
      }
    }
    this[INTERNALS$1] = {
      url: options2.url,
      status,
      statusText: options2.statusText || "",
      headers,
      counter: options2.counter,
      highWaterMark: options2.highWaterMark
    };
  }
  get url() {
    return this[INTERNALS$1].url || "";
  }
  get status() {
    return this[INTERNALS$1].status;
  }
  get ok() {
    return this[INTERNALS$1].status >= 200 && this[INTERNALS$1].status < 300;
  }
  get redirected() {
    return this[INTERNALS$1].counter > 0;
  }
  get statusText() {
    return this[INTERNALS$1].statusText;
  }
  get headers() {
    return this[INTERNALS$1].headers;
  }
  get highWaterMark() {
    return this[INTERNALS$1].highWaterMark;
  }
  clone() {
    return new Response(clone(this, this.highWaterMark), {
      url: this.url,
      status: this.status,
      statusText: this.statusText,
      headers: this.headers,
      ok: this.ok,
      redirected: this.redirected,
      size: this.size
    });
  }
  static redirect(url, status = 302) {
    if (!isRedirect(status)) {
      throw new RangeError('Failed to execute "redirect" on "response": Invalid status code');
    }
    return new Response(null, {
      headers: {
        location: new URL(url).toString()
      },
      status
    });
  }
  get [Symbol.toStringTag]() {
    return "Response";
  }
}
Object.defineProperties(Response.prototype, {
  url: {enumerable: true},
  status: {enumerable: true},
  ok: {enumerable: true},
  redirected: {enumerable: true},
  statusText: {enumerable: true},
  headers: {enumerable: true},
  clone: {enumerable: true}
});
const getSearch = (parsedURL) => {
  if (parsedURL.search) {
    return parsedURL.search;
  }
  const lastOffset = parsedURL.href.length - 1;
  const hash = parsedURL.hash || (parsedURL.href[lastOffset] === "#" ? "#" : "");
  return parsedURL.href[lastOffset - hash.length] === "?" ? "?" : "";
};
const INTERNALS = Symbol("Request internals");
const isRequest = (object) => {
  return typeof object === "object" && typeof object[INTERNALS] === "object";
};
class Request extends Body {
  constructor(input, init2 = {}) {
    let parsedURL;
    if (isRequest(input)) {
      parsedURL = new URL(input.url);
    } else {
      parsedURL = new URL(input);
      input = {};
    }
    let method = init2.method || input.method || "GET";
    method = method.toUpperCase();
    if ((init2.body != null || isRequest(input)) && input.body !== null && (method === "GET" || method === "HEAD")) {
      throw new TypeError("Request with GET/HEAD method cannot have body");
    }
    const inputBody = init2.body ? init2.body : isRequest(input) && input.body !== null ? clone(input) : null;
    super(inputBody, {
      size: init2.size || input.size || 0
    });
    const headers = new Headers(init2.headers || input.headers || {});
    if (inputBody !== null && !headers.has("Content-Type")) {
      const contentType = extractContentType(inputBody, this);
      if (contentType) {
        headers.append("Content-Type", contentType);
      }
    }
    let signal = isRequest(input) ? input.signal : null;
    if ("signal" in init2) {
      signal = init2.signal;
    }
    if (signal !== null && !isAbortSignal(signal)) {
      throw new TypeError("Expected signal to be an instanceof AbortSignal");
    }
    this[INTERNALS] = {
      method,
      redirect: init2.redirect || input.redirect || "follow",
      headers,
      parsedURL,
      signal
    };
    this.follow = init2.follow === void 0 ? input.follow === void 0 ? 20 : input.follow : init2.follow;
    this.compress = init2.compress === void 0 ? input.compress === void 0 ? true : input.compress : init2.compress;
    this.counter = init2.counter || input.counter || 0;
    this.agent = init2.agent || input.agent;
    this.highWaterMark = init2.highWaterMark || input.highWaterMark || 16384;
    this.insecureHTTPParser = init2.insecureHTTPParser || input.insecureHTTPParser || false;
  }
  get method() {
    return this[INTERNALS].method;
  }
  get url() {
    return format(this[INTERNALS].parsedURL);
  }
  get headers() {
    return this[INTERNALS].headers;
  }
  get redirect() {
    return this[INTERNALS].redirect;
  }
  get signal() {
    return this[INTERNALS].signal;
  }
  clone() {
    return new Request(this);
  }
  get [Symbol.toStringTag]() {
    return "Request";
  }
}
Object.defineProperties(Request.prototype, {
  method: {enumerable: true},
  url: {enumerable: true},
  headers: {enumerable: true},
  redirect: {enumerable: true},
  clone: {enumerable: true},
  signal: {enumerable: true}
});
const getNodeRequestOptions = (request) => {
  const {parsedURL} = request[INTERNALS];
  const headers = new Headers(request[INTERNALS].headers);
  if (!headers.has("Accept")) {
    headers.set("Accept", "*/*");
  }
  let contentLengthValue = null;
  if (request.body === null && /^(post|put)$/i.test(request.method)) {
    contentLengthValue = "0";
  }
  if (request.body !== null) {
    const totalBytes = getTotalBytes(request);
    if (typeof totalBytes === "number" && !Number.isNaN(totalBytes)) {
      contentLengthValue = String(totalBytes);
    }
  }
  if (contentLengthValue) {
    headers.set("Content-Length", contentLengthValue);
  }
  if (!headers.has("User-Agent")) {
    headers.set("User-Agent", "node-fetch");
  }
  if (request.compress && !headers.has("Accept-Encoding")) {
    headers.set("Accept-Encoding", "gzip,deflate,br");
  }
  let {agent} = request;
  if (typeof agent === "function") {
    agent = agent(parsedURL);
  }
  if (!headers.has("Connection") && !agent) {
    headers.set("Connection", "close");
  }
  const search = getSearch(parsedURL);
  const requestOptions = {
    path: parsedURL.pathname + search,
    pathname: parsedURL.pathname,
    hostname: parsedURL.hostname,
    protocol: parsedURL.protocol,
    port: parsedURL.port,
    hash: parsedURL.hash,
    search: parsedURL.search,
    query: parsedURL.query,
    href: parsedURL.href,
    method: request.method,
    headers: headers[Symbol.for("nodejs.util.inspect.custom")](),
    insecureHTTPParser: request.insecureHTTPParser,
    agent
  };
  return requestOptions;
};
class AbortError extends FetchBaseError {
  constructor(message, type = "aborted") {
    super(message, type);
  }
}
const supportedSchemas = new Set(["data:", "http:", "https:"]);
async function fetch(url, options_) {
  return new Promise((resolve2, reject) => {
    const request = new Request(url, options_);
    const options2 = getNodeRequestOptions(request);
    if (!supportedSchemas.has(options2.protocol)) {
      throw new TypeError(`node-fetch cannot load ${url}. URL scheme "${options2.protocol.replace(/:$/, "")}" is not supported.`);
    }
    if (options2.protocol === "data:") {
      const data = src(request.url);
      const response2 = new Response(data, {headers: {"Content-Type": data.typeFull}});
      resolve2(response2);
      return;
    }
    const send = (options2.protocol === "https:" ? https : http).request;
    const {signal} = request;
    let response = null;
    const abort = () => {
      const error2 = new AbortError("The operation was aborted.");
      reject(error2);
      if (request.body && request.body instanceof Stream.Readable) {
        request.body.destroy(error2);
      }
      if (!response || !response.body) {
        return;
      }
      response.body.emit("error", error2);
    };
    if (signal && signal.aborted) {
      abort();
      return;
    }
    const abortAndFinalize = () => {
      abort();
      finalize();
    };
    const request_ = send(options2);
    if (signal) {
      signal.addEventListener("abort", abortAndFinalize);
    }
    const finalize = () => {
      request_.abort();
      if (signal) {
        signal.removeEventListener("abort", abortAndFinalize);
      }
    };
    request_.on("error", (err) => {
      reject(new FetchError(`request to ${request.url} failed, reason: ${err.message}`, "system", err));
      finalize();
    });
    request_.on("response", (response_) => {
      request_.setTimeout(0);
      const headers = fromRawHeaders(response_.rawHeaders);
      if (isRedirect(response_.statusCode)) {
        const location = headers.get("Location");
        const locationURL = location === null ? null : new URL(location, request.url);
        switch (request.redirect) {
          case "error":
            reject(new FetchError(`uri requested responds with a redirect, redirect mode is set to error: ${request.url}`, "no-redirect"));
            finalize();
            return;
          case "manual":
            if (locationURL !== null) {
              try {
                headers.set("Location", locationURL);
              } catch (error2) {
                reject(error2);
              }
            }
            break;
          case "follow": {
            if (locationURL === null) {
              break;
            }
            if (request.counter >= request.follow) {
              reject(new FetchError(`maximum redirect reached at: ${request.url}`, "max-redirect"));
              finalize();
              return;
            }
            const requestOptions = {
              headers: new Headers(request.headers),
              follow: request.follow,
              counter: request.counter + 1,
              agent: request.agent,
              compress: request.compress,
              method: request.method,
              body: request.body,
              signal: request.signal,
              size: request.size
            };
            if (response_.statusCode !== 303 && request.body && options_.body instanceof Stream.Readable) {
              reject(new FetchError("Cannot follow redirect with body being a readable stream", "unsupported-redirect"));
              finalize();
              return;
            }
            if (response_.statusCode === 303 || (response_.statusCode === 301 || response_.statusCode === 302) && request.method === "POST") {
              requestOptions.method = "GET";
              requestOptions.body = void 0;
              requestOptions.headers.delete("content-length");
            }
            resolve2(fetch(new Request(locationURL, requestOptions)));
            finalize();
            return;
          }
        }
      }
      response_.once("end", () => {
        if (signal) {
          signal.removeEventListener("abort", abortAndFinalize);
        }
      });
      let body = pipeline(response_, new PassThrough(), (error2) => {
        reject(error2);
      });
      if (process.version < "v12.10") {
        response_.on("aborted", abortAndFinalize);
      }
      const responseOptions = {
        url: request.url,
        status: response_.statusCode,
        statusText: response_.statusMessage,
        headers,
        size: request.size,
        counter: request.counter,
        highWaterMark: request.highWaterMark
      };
      const codings = headers.get("Content-Encoding");
      if (!request.compress || request.method === "HEAD" || codings === null || response_.statusCode === 204 || response_.statusCode === 304) {
        response = new Response(body, responseOptions);
        resolve2(response);
        return;
      }
      const zlibOptions = {
        flush: zlib.Z_SYNC_FLUSH,
        finishFlush: zlib.Z_SYNC_FLUSH
      };
      if (codings === "gzip" || codings === "x-gzip") {
        body = pipeline(body, zlib.createGunzip(zlibOptions), (error2) => {
          reject(error2);
        });
        response = new Response(body, responseOptions);
        resolve2(response);
        return;
      }
      if (codings === "deflate" || codings === "x-deflate") {
        const raw = pipeline(response_, new PassThrough(), (error2) => {
          reject(error2);
        });
        raw.once("data", (chunk) => {
          if ((chunk[0] & 15) === 8) {
            body = pipeline(body, zlib.createInflate(), (error2) => {
              reject(error2);
            });
          } else {
            body = pipeline(body, zlib.createInflateRaw(), (error2) => {
              reject(error2);
            });
          }
          response = new Response(body, responseOptions);
          resolve2(response);
        });
        return;
      }
      if (codings === "br") {
        body = pipeline(body, zlib.createBrotliDecompress(), (error2) => {
          reject(error2);
        });
        response = new Response(body, responseOptions);
        resolve2(response);
        return;
      }
      response = new Response(body, responseOptions);
      resolve2(response);
    });
    writeToStream(request_, request);
  });
}
function noop() {
}
function safe_not_equal(a, b) {
  return a != a ? b == b : a !== b || (a && typeof a === "object" || typeof a === "function");
}
const subscriber_queue = [];
function writable(value, start = noop) {
  let stop;
  const subscribers = [];
  function set(new_value) {
    if (safe_not_equal(value, new_value)) {
      value = new_value;
      if (stop) {
        const run_queue = !subscriber_queue.length;
        for (let i = 0; i < subscribers.length; i += 1) {
          const s2 = subscribers[i];
          s2[1]();
          subscriber_queue.push(s2, value);
        }
        if (run_queue) {
          for (let i = 0; i < subscriber_queue.length; i += 2) {
            subscriber_queue[i][0](subscriber_queue[i + 1]);
          }
          subscriber_queue.length = 0;
        }
      }
    }
  }
  function update(fn) {
    set(fn(value));
  }
  function subscribe(run2, invalidate = noop) {
    const subscriber = [run2, invalidate];
    subscribers.push(subscriber);
    if (subscribers.length === 1) {
      stop = start(set) || noop;
    }
    run2(value);
    return () => {
      const index2 = subscribers.indexOf(subscriber);
      if (index2 !== -1) {
        subscribers.splice(index2, 1);
      }
      if (subscribers.length === 0) {
        stop();
        stop = null;
      }
    };
  }
  return {set, update, subscribe};
}
function normalize(loaded) {
  if (loaded.error) {
    const error2 = typeof loaded.error === "string" ? new Error(loaded.error) : loaded.error;
    const status = loaded.status;
    if (!(error2 instanceof Error)) {
      return {
        status: 500,
        error: new Error(`"error" property returned from load() must be a string or instance of Error, received type "${typeof error2}"`)
      };
    }
    if (!status || status < 400 || status > 599) {
      console.warn('"error" returned from load() without a valid status code \u2014 defaulting to 500');
      return {status: 500, error: error2};
    }
    return {status, error: error2};
  }
  if (loaded.redirect) {
    if (!loaded.status || Math.floor(loaded.status / 100) !== 3) {
      return {
        status: 500,
        error: new Error('"redirect" property returned from load() must be accompanied by a 3xx status code')
      };
    }
    if (typeof loaded.redirect !== "string") {
      return {
        status: 500,
        error: new Error('"redirect" property returned from load() must be a string')
      };
    }
  }
  return loaded;
}
const s = JSON.stringify;
async function get_response({request, options: options2, $session, route, status = 200, error: error2}) {
  const dependencies = {};
  const serialized_session = try_serialize($session, (error3) => {
    throw new Error(`Failed to serialize session data: ${error3.message}`);
  });
  const serialized_data = [];
  const match = route && route.pattern.exec(request.path);
  const params = route && route.params(match);
  const page = {
    host: request.host,
    path: request.path,
    query: request.query,
    params
  };
  let uses_credentials = false;
  const fetcher = async (resource, opts = {}) => {
    let url;
    if (typeof resource === "string") {
      url = resource;
    } else {
      url = resource.url;
      opts = {
        method: resource.method,
        headers: resource.headers,
        body: resource.body,
        mode: resource.mode,
        credentials: resource.credentials,
        cache: resource.cache,
        redirect: resource.redirect,
        referrer: resource.referrer,
        integrity: resource.integrity,
        ...opts
      };
    }
    if (options2.local && url.startsWith(options2.paths.assets)) {
      url = url.replace(options2.paths.assets, "");
    }
    const parsed = parse(url);
    if (opts.credentials !== "omit") {
      uses_credentials = true;
    }
    let response;
    if (parsed.protocol) {
      response = await fetch(parsed.href, opts);
    } else {
      const resolved = resolve(request.path, parsed.pathname);
      const filename = resolved.slice(1);
      const filename_html = `${filename}/index.html`;
      const asset = options2.manifest.assets.find((d) => d.file === filename || d.file === filename_html);
      if (asset) {
        if (options2.get_static_file) {
          response = new Response(options2.get_static_file(asset.file), {
            headers: {
              "content-type": asset.type
            }
          });
        } else {
          response = await fetch(`http://${page.host}/${asset.file}`, opts);
        }
      }
      if (!response) {
        const rendered2 = await ssr({
          host: request.host,
          method: opts.method || "GET",
          headers: opts.headers || {},
          path: resolved,
          body: opts.body,
          query: new URLSearchParams$1(parsed.query || "")
        }, {
          ...options2,
          fetched: url,
          initiator: route
        });
        if (rendered2) {
          dependencies[resolved] = rendered2;
          response = new Response(rendered2.body, {
            status: rendered2.status,
            headers: rendered2.headers
          });
        }
      }
    }
    if (response) {
      const headers2 = {};
      response.headers.forEach((value, key) => {
        if (key !== "etag")
          headers2[key] = value;
      });
      const inline = {
        url,
        payload: {
          status: response.status,
          statusText: response.statusText,
          headers: headers2,
          body: null
        }
      };
      const proxy = new Proxy(response, {
        get(response2, key, receiver) {
          if (key === "text") {
            return async () => {
              const text = await response2.text();
              inline.payload.body = text;
              serialized_data.push(inline);
              return text;
            };
          }
          if (key === "json") {
            return async () => {
              const json = await response2.json();
              inline.payload.body = s(json);
              serialized_data.push(inline);
              return json;
            };
          }
          return Reflect.get(response2, key, receiver);
        }
      });
      return proxy;
    }
    return new Response("Not found", {
      status: 404
    });
  };
  const component_promises = error2 ? [options2.manifest.layout()] : [options2.manifest.layout(), ...route.parts.map((part) => part.load())];
  const components2 = [];
  const props_promises = [];
  let context = {};
  let maxage;
  if (options2.only_render_prerenderable_pages) {
    if (error2)
      return;
    const mod = await component_promises[component_promises.length - 1];
    if (!mod.prerender)
      return;
  }
  for (let i = 0; i < component_promises.length; i += 1) {
    let loaded;
    try {
      const mod = await component_promises[i];
      components2[i] = mod.default;
      if (mod.preload) {
        throw new Error("preload has been deprecated in favour of load. Please consult the documentation: https://kit.svelte.dev/docs#load");
      }
      if (mod.load) {
        loaded = await mod.load.call(null, {
          page,
          get session() {
            uses_credentials = true;
            return $session;
          },
          fetch: fetcher,
          context: {...context}
        });
        if (!loaded)
          return;
      }
    } catch (e) {
      if (error2)
        throw e instanceof Error ? e : new Error(e);
      loaded = {
        error: e instanceof Error ? e : {name: "Error", message: e.toString()},
        status: 500
      };
    }
    if (loaded) {
      loaded = normalize(loaded);
      if (loaded.error) {
        return await get_response({
          request,
          options: options2,
          $session,
          route,
          status: loaded.status,
          error: loaded.error
        });
      }
      if (loaded.redirect) {
        return {
          status: loaded.status,
          headers: {
            location: loaded.redirect
          }
        };
      }
      if (loaded.context) {
        context = {
          ...context,
          ...loaded.context
        };
      }
      maxage = loaded.maxage || 0;
      props_promises[i] = loaded.props;
    }
  }
  const session = writable($session);
  let session_tracking_active = false;
  const unsubscribe = session.subscribe(() => {
    if (session_tracking_active)
      uses_credentials = true;
  });
  session_tracking_active = true;
  if (error2) {
    if (options2.dev) {
      error2.stack = await options2.get_stack(error2);
    } else {
      error2.stack = String(error2);
    }
  }
  const props = {
    status,
    error: error2,
    stores: {
      page: writable(null),
      navigating: writable(null),
      session
    },
    page,
    components: components2
  };
  for (let i = 0; i < props_promises.length; i += 1) {
    props[`props_${i}`] = await props_promises[i];
  }
  let rendered;
  try {
    rendered = options2.root.render(props);
  } catch (e) {
    if (error2)
      throw e instanceof Error ? e : new Error(e);
    return await get_response({
      request,
      options: options2,
      $session,
      route,
      status: 500,
      error: e instanceof Error ? e : {name: "Error", message: e.toString()}
    });
  }
  unsubscribe();
  const js_deps = route ? route.js : [];
  const css_deps = route ? route.css : [];
  const style = route ? route.style : "";
  const prefix = `${options2.paths.assets}/${options2.app_dir}`;
  const links = options2.amp ? `<style amp-custom>${style || (await Promise.all(css_deps.map((dep) => options2.get_amp_css(dep)))).join("\n")}</style>` : [
    ...js_deps.map((dep) => `<link rel="modulepreload" href="${prefix}/${dep}">`),
    ...css_deps.map((dep) => `<link rel="stylesheet" href="${prefix}/${dep}">`)
  ].join("\n			");
  const init2 = options2.amp ? `
		<style amp-boilerplate>body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-o-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}</style>
		<noscript><style amp-boilerplate>body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}</style></noscript>
		<script async src="https://cdn.ampproject.org/v0.js"></script>` : `
		<script type="module">
			import { start } from ${s(options2.entry)};
			start({
				target: ${options2.target ? `document.querySelector(${s(options2.target)})` : "document.body"},
				paths: ${s(options2.paths)},
				status: ${status},
				error: ${serialize_error(error2)},
				session: ${serialized_session},
				nodes: [
					${(route ? route.parts : []).map((part) => `import(${s(options2.get_component_path(part.id))})`).join(",\n					")}
				],
				page: {
					host: ${s(request.host || "location.host")},
					path: ${s(request.path)},
					query: new URLSearchParams(${s(request.query.toString())}),
					params: ${s(params)}
				}
			});
		</script>`;
  const head = [
    rendered.head,
    style && !options2.amp ? `<style data-svelte>${style}</style>` : "",
    links,
    init2
  ].join("\n\n");
  const body = options2.amp ? rendered.html : `${rendered.html}

			${serialized_data.map(({url, payload}) => `<script type="svelte-data" url="${url}">${s(payload)}</script>`).join("\n\n			")}
		`.replace(/^\t{2}/gm, "");
  const headers = {
    "content-type": "text/html"
  };
  if (maxage) {
    headers["cache-control"] = `${uses_credentials ? "private" : "public"}, max-age=${maxage}`;
  }
  return {
    status,
    headers,
    body: options2.template({head, body}),
    dependencies
  };
}
async function render_page(request, route, options2) {
  if (options2.initiator === route) {
    return {
      status: 404,
      headers: {},
      body: `Not found: ${request.path}`
    };
  }
  const $session = await options2.hooks.getSession({context: request.context});
  const response = await get_response({
    request,
    options: options2,
    $session,
    route,
    status: route ? 200 : 404,
    error: route ? null : new Error(`Not found: ${request.path}`)
  });
  if (response) {
    return response;
  }
  if (options2.fetched) {
    return {
      status: 500,
      headers: {},
      body: `Bad request in load function: failed to fetch ${options2.fetched}`
    };
  }
}
function try_serialize(data, fail) {
  try {
    return devalue(data);
  } catch (err) {
    if (fail)
      fail(err);
    return null;
  }
}
function serialize_error(error2) {
  if (!error2)
    return null;
  let serialized = try_serialize(error2);
  if (!serialized) {
    const {name, message, stack} = error2;
    serialized = try_serialize({name, message, stack});
  }
  if (!serialized) {
    serialized = "{}";
  }
  return serialized;
}
async function render_route(request, route) {
  const mod = await route.load();
  const handler = mod[request.method.toLowerCase().replace("delete", "del")];
  if (handler) {
    const match = route.pattern.exec(request.path);
    const params = route.params(match);
    const response = await handler({...request, params});
    if (response) {
      if (typeof response !== "object" || response.body == null) {
        return {
          status: 500,
          body: `Invalid response from route ${request.path}; ${response.body == null ? "body is missing" : `expected an object, got ${typeof response}`}`,
          headers: {}
        };
      }
      let {status = 200, body, headers = {}} = response;
      headers = lowercase_keys(headers);
      if (typeof body === "object" && !("content-type" in headers) || headers["content-type"] === "application/json") {
        headers = {...headers, "content-type": "application/json"};
        body = JSON.stringify(body);
      }
      return {status, body, headers};
    }
  }
}
function lowercase_keys(obj) {
  const clone2 = {};
  for (const key in obj) {
    clone2[key.toLowerCase()] = obj[key];
  }
  return clone2;
}
function md5(body) {
  return createHash("md5").update(body).digest("hex");
}
async function ssr(incoming, options2) {
  if (incoming.path.endsWith("/") && incoming.path !== "/") {
    const q = incoming.query.toString();
    return {
      status: 301,
      headers: {
        location: incoming.path.slice(0, -1) + (q ? `?${q}` : "")
      }
    };
  }
  const context = await options2.hooks.getContext(incoming) || {};
  try {
    return await options2.hooks.handle({
      ...incoming,
      params: null,
      context
    }, async (request) => {
      for (const route of options2.manifest.routes) {
        if (!route.pattern.test(request.path))
          continue;
        const response = route.type === "endpoint" ? await render_route(request, route) : await render_page(request, route, options2);
        if (response) {
          if (response.status === 200) {
            if (!/(no-store|immutable)/.test(response.headers["cache-control"])) {
              const etag = `"${md5(response.body)}"`;
              if (request.headers["if-none-match"] === etag) {
                return {
                  status: 304,
                  headers: {},
                  body: null
                };
              }
              response.headers["etag"] = etag;
            }
          }
          return response;
        }
      }
      return await render_page(request, null, options2);
    });
  } catch (e) {
    if (e && e.stack) {
      e.stack = await options2.get_stack(e);
    }
    console.error(e && e.stack || e);
    return {
      status: 500,
      headers: {},
      body: options2.dev ? e.stack : e.message
    };
  }
}
function run(fn) {
  return fn();
}
function blank_object() {
  return Object.create(null);
}
function run_all(fns) {
  fns.forEach(run);
}
let current_component;
function set_current_component(component) {
  current_component = component;
}
function get_current_component() {
  if (!current_component)
    throw new Error("Function called outside component initialization");
  return current_component;
}
function onMount(fn) {
  get_current_component().$$.on_mount.push(fn);
}
function afterUpdate(fn) {
  get_current_component().$$.after_update.push(fn);
}
function setContext(key, context) {
  get_current_component().$$.context.set(key, context);
}
const escaped = {
  '"': "&quot;",
  "'": "&#39;",
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;"
};
function escape(html) {
  return String(html).replace(/["'&<>]/g, (match) => escaped[match]);
}
const missing_component = {
  $$render: () => ""
};
function validate_component(component, name) {
  if (!component || !component.$$render) {
    if (name === "svelte:component")
      name += " this={...}";
    throw new Error(`<${name}> is not a valid SSR component. You may need to review your build config to ensure that dependencies are compiled, rather than imported as pre-compiled modules`);
  }
  return component;
}
let on_destroy;
function create_ssr_component(fn) {
  function $$render(result, props, bindings, slots) {
    const parent_component = current_component;
    const $$ = {
      on_destroy,
      context: new Map(parent_component ? parent_component.$$.context : []),
      on_mount: [],
      before_update: [],
      after_update: [],
      callbacks: blank_object()
    };
    set_current_component({$$});
    const html = fn(result, props, bindings, slots);
    set_current_component(parent_component);
    return html;
  }
  return {
    render: (props = {}, options2 = {}) => {
      on_destroy = [];
      const result = {title: "", head: "", css: new Set()};
      const html = $$render(result, props, {}, options2);
      run_all(on_destroy);
      return {
        html,
        css: {
          code: Array.from(result.css).map((css2) => css2.code).join("\n"),
          map: null
        },
        head: result.title + result.head
      };
    },
    $$render
  };
}
const Error$1 = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let {status} = $$props;
  let {error: error2} = $$props;
  if ($$props.status === void 0 && $$bindings.status && status !== void 0)
    $$bindings.status(status);
  if ($$props.error === void 0 && $$bindings.error && error2 !== void 0)
    $$bindings.error(error2);
  return `<h1>${escape(status)}</h1>

<p>${escape(error2.message)}</p>


${error2.stack ? `<pre>${escape(error2.stack)}</pre>` : ``}`;
});
var error = /* @__PURE__ */ Object.freeze({
  __proto__: null,
  [Symbol.toStringTag]: "Module",
  default: Error$1
});
var root_svelte = "#svelte-announcer.svelte-1j55zn5{position:absolute;left:0;top:0;clip:rect(0 0 0 0);clip-path:inset(50%);overflow:hidden;white-space:nowrap;width:1px;height:1px}";
const css$2 = {
  code: "#svelte-announcer.svelte-1j55zn5{position:absolute;left:0;top:0;clip:rect(0 0 0 0);clip-path:inset(50%);overflow:hidden;white-space:nowrap;width:1px;height:1px}",
  map: `{"version":3,"file":"root.svelte","sources":["root.svelte"],"sourcesContent":["<!-- This file is generated by @sveltejs/kit \u2014 do not edit it! -->\\n<script>\\n\\timport { setContext, afterUpdate, onMount } from 'svelte';\\n\\timport ErrorComponent from \\"../components/error.svelte\\";\\n\\n\\t// error handling\\n\\texport let status = undefined;\\n\\texport let error = undefined;\\n\\n\\t// stores\\n\\texport let stores;\\n\\texport let page;\\n\\n\\texport let components;\\n\\texport let props_0 = null;\\n\\texport let props_1 = null;\\n\\n\\tconst Layout = components[0];\\n\\n\\tsetContext('__svelte__', stores);\\n\\n\\t$: stores.page.set(page);\\n\\tafterUpdate(stores.page.notify);\\n\\n\\tlet mounted = false;\\n\\tlet navigated = false;\\n\\tlet title = null;\\n\\n\\tonMount(() => {\\n\\t\\tconst unsubscribe = stores.page.subscribe(() => {\\n\\t\\t\\tif (mounted) {\\n\\t\\t\\t\\tnavigated = true;\\n\\t\\t\\t\\ttitle = document.title;\\n\\t\\t\\t}\\n\\t\\t});\\n\\n\\t\\tmounted = true;\\n\\t\\treturn unsubscribe;\\n\\t});\\n</script>\\n\\n<Layout {...(props_0 || {})}>\\n\\t{#if error}\\n\\t\\t<ErrorComponent {status} {error}/>\\n\\t{:else}\\n\\t\\t<svelte:component this={components[1]} {...(props_1 || {})}/>\\n\\t{/if}\\n</Layout>\\n\\n{#if mounted}\\n\\t<div id=\\"svelte-announcer\\" aria-live=\\"assertive\\" aria-atomic=\\"true\\">\\n\\t\\t{#if navigated}\\n\\t\\t\\tNavigated to {title}\\n\\t\\t{/if}\\n\\t</div>\\n{/if}\\n\\n<style>\\n\\t#svelte-announcer {\\n\\t\\tposition: absolute;\\n\\t\\tleft: 0;\\n\\t\\ttop: 0;\\n\\t\\tclip: rect(0 0 0 0);\\n\\t\\tclip-path: inset(50%);\\n\\t\\toverflow: hidden;\\n\\t\\twhite-space: nowrap;\\n\\t\\twidth: 1px;\\n\\t\\theight: 1px;\\n\\t}\\n</style>"],"names":[],"mappings":"AA0DC,iBAAiB,eAAC,CAAC,AAClB,QAAQ,CAAE,QAAQ,CAClB,IAAI,CAAE,CAAC,CACP,GAAG,CAAE,CAAC,CACN,IAAI,CAAE,KAAK,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CACnB,SAAS,CAAE,MAAM,GAAG,CAAC,CACrB,QAAQ,CAAE,MAAM,CAChB,WAAW,CAAE,MAAM,CACnB,KAAK,CAAE,GAAG,CACV,MAAM,CAAE,GAAG,AACZ,CAAC"}`
};
const Root = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let {status = void 0} = $$props;
  let {error: error2 = void 0} = $$props;
  let {stores} = $$props;
  let {page} = $$props;
  let {components: components2} = $$props;
  let {props_0 = null} = $$props;
  let {props_1 = null} = $$props;
  const Layout = components2[0];
  setContext("__svelte__", stores);
  afterUpdate(stores.page.notify);
  let mounted = false;
  let navigated = false;
  let title = null;
  onMount(() => {
    const unsubscribe = stores.page.subscribe(() => {
      if (mounted) {
        navigated = true;
        title = document.title;
      }
    });
    mounted = true;
    return unsubscribe;
  });
  if ($$props.status === void 0 && $$bindings.status && status !== void 0)
    $$bindings.status(status);
  if ($$props.error === void 0 && $$bindings.error && error2 !== void 0)
    $$bindings.error(error2);
  if ($$props.stores === void 0 && $$bindings.stores && stores !== void 0)
    $$bindings.stores(stores);
  if ($$props.page === void 0 && $$bindings.page && page !== void 0)
    $$bindings.page(page);
  if ($$props.components === void 0 && $$bindings.components && components2 !== void 0)
    $$bindings.components(components2);
  if ($$props.props_0 === void 0 && $$bindings.props_0 && props_0 !== void 0)
    $$bindings.props_0(props_0);
  if ($$props.props_1 === void 0 && $$bindings.props_1 && props_1 !== void 0)
    $$bindings.props_1(props_1);
  $$result.css.add(css$2);
  {
    stores.page.set(page);
  }
  return `


${validate_component(Layout, "Layout").$$render($$result, Object.assign(props_0 || {}), {}, {
    default: () => `${error2 ? `${validate_component(Error$1, "ErrorComponent").$$render($$result, {status, error: error2}, {}, {})}` : `${validate_component(components2[1] || missing_component, "svelte:component").$$render($$result, Object.assign(props_1 || {}), {}, {})}`}`
  })}

${mounted ? `<div id="${"svelte-announcer"}" aria-live="${"assertive"}" aria-atomic="${"true"}" class="${"svelte-1j55zn5"}">${navigated ? `Navigated to ${escape(title)}` : ``}</div>` : ``}`;
});
var user_hooks = /* @__PURE__ */ Object.freeze({
  __proto__: null,
  [Symbol.toStringTag]: "Module"
});
const template = ({head, body}) => '<!DOCTYPE html>\n<html lang="en">\n	<head>\n		<meta charset="utf-8" />\n		<link rel="icon" href="/favicon.ico" />\n		<meta name="viewport" content="width=device-width, initial-scale=1" />\n		' + head + '\n	</head>\n	<body>\n		<div id="svelte">' + body + "</div>\n	</body>\n</html>\n";
function init({paths}) {
}
const empty = () => ({});
const components = [
  () => Promise.resolve().then(function() {
    return index;
  })
];
const client_component_lookup = {".svelte/build/runtime/internal/start.js": "start-60add530.js", "src/routes/index.svelte": "pages/index.svelte-9b34e677.js"};
const manifest = {
  assets: [{file: "favicon.ico", size: 1150, type: "image/vnd.microsoft.icon"}, {file: "robots.txt", size: 67, type: "text/plain"}],
  layout: () => Promise.resolve().then(function() {
    return $layout$1;
  }),
  error: () => Promise.resolve().then(function() {
    return error;
  }),
  routes: [
    {
      type: "page",
      pattern: /^\/$/,
      params: empty,
      parts: [{id: "src/routes/index.svelte", load: components[0]}],
      css: ["assets/start-01d37f61.css", "assets/pages/index.svelte-b9d95ee4.css"],
      js: ["start-60add530.js", "chunks/index-5c798485.js", "pages/index.svelte-9b34e677.js"]
    }
  ]
};
const get_hooks = (hooks2) => ({
  getContext: hooks2.getContext || (() => ({})),
  getSession: hooks2.getSession || (() => ({})),
  handle: hooks2.handle || ((request, render2) => render2(request))
});
const hooks = get_hooks(user_hooks);
function render(request, {
  paths = {base: "", assets: "/."},
  local = false,
  only_render_prerenderable_pages = false,
  get_static_file
} = {}) {
  return ssr({
    ...request,
    host: request.headers["host"]
  }, {
    paths,
    local,
    template,
    manifest,
    target: "#svelte",
    entry: "/./_app/start-60add530.js",
    root: Root,
    hooks,
    dev: false,
    amp: false,
    only_render_prerenderable_pages,
    app_dir: "_app",
    get_component_path: (id) => "/./_app/" + client_component_lookup[id],
    get_stack: (error2) => error2.stack,
    get_static_file,
    get_amp_css: (dep) => amp_css_lookup[dep]
  });
}
const apiEndpoint = "https://alexthings-sveltekit.cdn.prismic.io/api/v2";
const options = {lang: "en-gb"};
const client = Prismic.client(apiEndpoint);
var index_svelte = ".header.svelte-xpllna.svelte-xpllna{color:white;background-size:cover;background:#355c7d;background:linear-gradient(\n			to right,\n			#c06c84,\n			#6c5b7b,\n			#355c7d\n		);min-height:25vw;padding-top:2rem;justify-content:flex-start}h1.svelte-xpllna.svelte-xpllna{font-family:'Lato', sans-serif;font-weight:300;letter-spacing:2px;font-size:48px}p.svelte-xpllna.svelte-xpllna{font-family:'Lato', sans-serif;letter-spacing:1px;font-size:14px;color:#333333}.header.svelte-xpllna.svelte-xpllna{position:relative;text-align:center;background:linear-gradient(60deg, rgba(84, 58, 183, 1) 0%, rgba(0, 172, 193, 1) 100%);color:white}.inner-header.svelte-xpllna.svelte-xpllna{height:65vh;width:100%;margin:0;padding:0}.flex.svelte-xpllna.svelte-xpllna{display:flex;justify-content:center;align-items:center;text-align:center}.waves.svelte-xpllna.svelte-xpllna{position:relative;width:100%;height:15vh;margin-bottom:-7px;min-height:100px;max-height:150px}.content.svelte-xpllna.svelte-xpllna{position:relative;height:20vh;text-align:center;background-color:white}.parallax.svelte-xpllna>use.svelte-xpllna{animation:svelte-xpllna-move-forever 50s cubic-bezier(0.55, 0.5, 0.45, 0.5) infinite}.parallax.svelte-xpllna>use.svelte-xpllna:nth-child(1){animation-delay:-4s;animation-duration:24s}.parallax.svelte-xpllna>use.svelte-xpllna:nth-child(2){animation-delay:-6s;animation-duration:40s}.parallax.svelte-xpllna>use.svelte-xpllna:nth-child(3){animation-delay:-8s;animation-duration:46s}.parallax.svelte-xpllna>use.svelte-xpllna:nth-child(4){animation-delay:-10s;animation-duration:80s}@keyframes svelte-xpllna-move-forever{0%{transform:translate3d(-90px, 0, 0)}100%{transform:translate3d(85px, 0, 0)}}@media(max-width: 768px){.waves.svelte-xpllna.svelte-xpllna{height:40px;min-height:40px}.content.svelte-xpllna.svelte-xpllna{height:30vh}h1.svelte-xpllna.svelte-xpllna{font-size:24px}}";
const css$1 = {
  code: ".header.svelte-xpllna.svelte-xpllna{color:white;background-size:cover;background:#355c7d;background:linear-gradient(\n			to right,\n			#c06c84,\n			#6c5b7b,\n			#355c7d\n		);min-height:25vw;padding-top:2rem;justify-content:flex-start}h1.svelte-xpllna.svelte-xpllna{font-family:'Lato', sans-serif;font-weight:300;letter-spacing:2px;font-size:48px}p.svelte-xpllna.svelte-xpllna{font-family:'Lato', sans-serif;letter-spacing:1px;font-size:14px;color:#333333}.header.svelte-xpllna.svelte-xpllna{position:relative;text-align:center;background:linear-gradient(60deg, rgba(84, 58, 183, 1) 0%, rgba(0, 172, 193, 1) 100%);color:white}.inner-header.svelte-xpllna.svelte-xpllna{height:65vh;width:100%;margin:0;padding:0}.flex.svelte-xpllna.svelte-xpllna{display:flex;justify-content:center;align-items:center;text-align:center}.waves.svelte-xpllna.svelte-xpllna{position:relative;width:100%;height:15vh;margin-bottom:-7px;min-height:100px;max-height:150px}.content.svelte-xpllna.svelte-xpllna{position:relative;height:20vh;text-align:center;background-color:white}.parallax.svelte-xpllna>use.svelte-xpllna{animation:svelte-xpllna-move-forever 50s cubic-bezier(0.55, 0.5, 0.45, 0.5) infinite}.parallax.svelte-xpllna>use.svelte-xpllna:nth-child(1){animation-delay:-4s;animation-duration:24s}.parallax.svelte-xpllna>use.svelte-xpllna:nth-child(2){animation-delay:-6s;animation-duration:40s}.parallax.svelte-xpllna>use.svelte-xpllna:nth-child(3){animation-delay:-8s;animation-duration:46s}.parallax.svelte-xpllna>use.svelte-xpllna:nth-child(4){animation-delay:-10s;animation-duration:80s}@keyframes svelte-xpllna-move-forever{0%{transform:translate3d(-90px, 0, 0)}100%{transform:translate3d(85px, 0, 0)}}@media(max-width: 768px){.waves.svelte-xpllna.svelte-xpllna{height:40px;min-height:40px}.content.svelte-xpllna.svelte-xpllna{height:30vh}h1.svelte-xpllna.svelte-xpllna{font-size:24px}}",
  map: `{"version":3,"file":"index.svelte","sources":["index.svelte"],"sourcesContent":["<script context=\\"module\\">\\n\\timport { client, options } from './../../utils/client';\\n\\timport PrismicDom from 'prismic-dom';\\n\\n\\texport async function load() {\\n\\t\\tconst document = await client.getByUID('page', 'homepage', options);\\n\\t\\treturn {\\n\\t\\t\\tprops: {\\n\\t\\t\\t\\tdocument\\n\\t\\t\\t}\\n\\t\\t};\\n\\t}\\n</script>\\n\\n<script>\\n\\texport let document = { data: { title: 'Loading...' } };\\n</script>\\n\\n<main>\\n\\t<div class=\\"header\\">\\n\\t\\t<div class=\\"inner-header flex\\">\\n\\t\\t\\t<h1>{document.data.title}</h1>\\n\\t\\t</div>\\n\\n\\t\\t<div>\\n\\t\\t\\t<svg\\n\\t\\t\\t\\tclass=\\"waves\\"\\n\\t\\t\\t\\txmlns=\\"http://www.w3.org/2000/svg\\"\\n\\t\\t\\t\\txmlns:xlink=\\"http://www.w3.org/1999/xlink\\"\\n\\t\\t\\t\\tviewBox=\\"0 24 150 28\\"\\n\\t\\t\\t\\tpreserveAspectRatio=\\"none\\"\\n\\t\\t\\t\\tshape-rendering=\\"auto\\"\\n\\t\\t\\t>\\n\\t\\t\\t\\t<defs>\\n\\t\\t\\t\\t\\t<path\\n\\t\\t\\t\\t\\t\\tid=\\"gentle-wave\\"\\n\\t\\t\\t\\t\\t\\td=\\"M-160 44c30 0 58-18 88-18s 58 18 88 18 58-18 88-18 58 18 88 18 v44h-352z\\"\\n\\t\\t\\t\\t\\t/>\\n\\t\\t\\t\\t</defs>\\n\\t\\t\\t\\t<g class=\\"parallax\\">\\n\\t\\t\\t\\t\\t<use xlink:href=\\"#gentle-wave\\" x=\\"48\\" y=\\"0\\" fill=\\"rgba(255,255,255,0.7\\" />\\n\\t\\t\\t\\t\\t<use xlink:href=\\"#gentle-wave\\" x=\\"48\\" y=\\"3\\" fill=\\"rgba(255,255,255,0.5)\\" />\\n\\t\\t\\t\\t\\t<use xlink:href=\\"#gentle-wave\\" x=\\"48\\" y=\\"5\\" fill=\\"rgba(255,255,255,0.3)\\" />\\n\\t\\t\\t\\t\\t<use xlink:href=\\"#gentle-wave\\" x=\\"48\\" y=\\"7\\" fill=\\"#fff\\" />\\n\\t\\t\\t\\t</g>\\n\\t\\t\\t</svg>\\n\\t\\t</div>\\n\\t</div>\\n\\n\\t<div class=\\"content flex\\">\\n\\t\\t<p>Alex Davis | {new Date().getFullYear()}</p>\\n\\t</div>\\n\\t<div class=\\"container\\">\\n\\t\\t<div class=\\"text\\">\\n\\t\\t\\t{@html PrismicDom.RichText.asHtml(document.data.content)}\\n\\t\\t</div>\\n\\t</div>\\n</main>\\n\\n<style>\\n\\t.header {\\n\\t\\tcolor: white;\\n\\t\\tbackground-size: cover;\\n\\t\\tbackground: #355c7d; /* fallback for old browsers */\\n\\t\\tbackground: linear-gradient(\\n\\t\\t\\tto right,\\n\\t\\t\\t#c06c84,\\n\\t\\t\\t#6c5b7b,\\n\\t\\t\\t#355c7d\\n\\t\\t); /* W3C, IE 10+/ Edge, Firefox 16+, Chrome 26+, Opera 12+, Safari 7+ */\\n\\t\\tmin-height: 25vw;\\n\\t\\tpadding-top: 2rem;\\n\\t\\tjustify-content: flex-start;\\n\\t}\\n\\n\\th1 {\\n\\t\\tfont-family: 'Lato', sans-serif;\\n\\t\\tfont-weight: 300;\\n\\t\\tletter-spacing: 2px;\\n\\t\\tfont-size: 48px;\\n\\t}\\n\\n\\tp {\\n\\t\\tfont-family: 'Lato', sans-serif;\\n\\t\\tletter-spacing: 1px;\\n\\t\\tfont-size: 14px;\\n\\t\\tcolor: #333333;\\n\\t}\\n\\n\\t.header {\\n\\t\\tposition: relative;\\n\\t\\ttext-align: center;\\n\\t\\tbackground: linear-gradient(60deg, rgba(84, 58, 183, 1) 0%, rgba(0, 172, 193, 1) 100%);\\n\\t\\tcolor: white;\\n\\t}\\n\\n\\t.inner-header {\\n\\t\\theight: 65vh;\\n\\t\\twidth: 100%;\\n\\t\\tmargin: 0;\\n\\t\\tpadding: 0;\\n\\t}\\n\\n\\t.flex {\\n\\t\\t/*Flexbox for containers*/\\n\\t\\tdisplay: flex;\\n\\t\\tjustify-content: center;\\n\\t\\talign-items: center;\\n\\t\\ttext-align: center;\\n\\t}\\n\\n\\t.waves {\\n\\t\\tposition: relative;\\n\\t\\twidth: 100%;\\n\\t\\theight: 15vh;\\n\\t\\tmargin-bottom: -7px;\\n\\t\\t/*Fix for safari gap*/\\n\\t\\tmin-height: 100px;\\n\\t\\tmax-height: 150px;\\n\\t}\\n\\n\\t.content {\\n\\t\\tposition: relative;\\n\\t\\theight: 20vh;\\n\\t\\ttext-align: center;\\n\\t\\tbackground-color: white;\\n\\t}\\n\\n\\t/* Animation */\\n\\n\\t.parallax > use {\\n\\t\\tanimation: move-forever 50s cubic-bezier(0.55, 0.5, 0.45, 0.5) infinite;\\n\\t}\\n\\n\\t.parallax > use:nth-child(1) {\\n\\t\\tanimation-delay: -4s;\\n\\t\\tanimation-duration: 24s;\\n\\t}\\n\\n\\t.parallax > use:nth-child(2) {\\n\\t\\tanimation-delay: -6s;\\n\\t\\tanimation-duration: 40s;\\n\\t}\\n\\n\\t.parallax > use:nth-child(3) {\\n\\t\\tanimation-delay: -8s;\\n\\t\\tanimation-duration: 46s;\\n\\t}\\n\\n\\t.parallax > use:nth-child(4) {\\n\\t\\tanimation-delay: -10s;\\n\\t\\tanimation-duration: 80s;\\n\\t}\\n\\n\\t@keyframes move-forever {\\n\\t\\t0% {\\n\\t\\t\\ttransform: translate3d(-90px, 0, 0);\\n\\t\\t}\\n\\t\\t100% {\\n\\t\\t\\ttransform: translate3d(85px, 0, 0);\\n\\t\\t}\\n\\t}\\n\\n\\t/*Shrinking for mobile*/\\n\\n\\t@media (max-width: 768px) {\\n\\t\\t.waves {\\n\\t\\t\\theight: 40px;\\n\\t\\t\\tmin-height: 40px;\\n\\t\\t}\\n\\t\\t.content {\\n\\t\\t\\theight: 30vh;\\n\\t\\t}\\n\\t\\th1 {\\n\\t\\t\\tfont-size: 24px;\\n\\t\\t}\\n\\t}\\n</style>\\n"],"names":[],"mappings":"AA4DC,OAAO,4BAAC,CAAC,AACR,KAAK,CAAE,KAAK,CACZ,eAAe,CAAE,KAAK,CACtB,UAAU,CAAE,OAAO,CACnB,UAAU,CAAE;GACX,EAAE,CAAC,KAAK,CAAC;GACT,OAAO,CAAC;GACR,OAAO,CAAC;GACR,OAAO;GACP,CACD,UAAU,CAAE,IAAI,CAChB,WAAW,CAAE,IAAI,CACjB,eAAe,CAAE,UAAU,AAC5B,CAAC,AAED,EAAE,4BAAC,CAAC,AACH,WAAW,CAAE,MAAM,CAAC,CAAC,UAAU,CAC/B,WAAW,CAAE,GAAG,CAChB,cAAc,CAAE,GAAG,CACnB,SAAS,CAAE,IAAI,AAChB,CAAC,AAED,CAAC,4BAAC,CAAC,AACF,WAAW,CAAE,MAAM,CAAC,CAAC,UAAU,CAC/B,cAAc,CAAE,GAAG,CACnB,SAAS,CAAE,IAAI,CACf,KAAK,CAAE,OAAO,AACf,CAAC,AAED,OAAO,4BAAC,CAAC,AACR,QAAQ,CAAE,QAAQ,CAClB,UAAU,CAAE,MAAM,CAClB,UAAU,CAAE,gBAAgB,KAAK,CAAC,CAAC,KAAK,EAAE,CAAC,CAAC,EAAE,CAAC,CAAC,GAAG,CAAC,CAAC,CAAC,CAAC,CAAC,EAAE,CAAC,CAAC,KAAK,CAAC,CAAC,CAAC,GAAG,CAAC,CAAC,GAAG,CAAC,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,CACtF,KAAK,CAAE,KAAK,AACb,CAAC,AAED,aAAa,4BAAC,CAAC,AACd,MAAM,CAAE,IAAI,CACZ,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,CAAC,CACT,OAAO,CAAE,CAAC,AACX,CAAC,AAED,KAAK,4BAAC,CAAC,AAEN,OAAO,CAAE,IAAI,CACb,eAAe,CAAE,MAAM,CACvB,WAAW,CAAE,MAAM,CACnB,UAAU,CAAE,MAAM,AACnB,CAAC,AAED,MAAM,4BAAC,CAAC,AACP,QAAQ,CAAE,QAAQ,CAClB,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,IAAI,CACZ,aAAa,CAAE,IAAI,CAEnB,UAAU,CAAE,KAAK,CACjB,UAAU,CAAE,KAAK,AAClB,CAAC,AAED,QAAQ,4BAAC,CAAC,AACT,QAAQ,CAAE,QAAQ,CAClB,MAAM,CAAE,IAAI,CACZ,UAAU,CAAE,MAAM,CAClB,gBAAgB,CAAE,KAAK,AACxB,CAAC,AAID,uBAAS,CAAG,GAAG,cAAC,CAAC,AAChB,SAAS,CAAE,0BAAY,CAAC,GAAG,CAAC,aAAa,IAAI,CAAC,CAAC,GAAG,CAAC,CAAC,IAAI,CAAC,CAAC,GAAG,CAAC,CAAC,QAAQ,AACxE,CAAC,AAED,uBAAS,CAAG,iBAAG,WAAW,CAAC,CAAC,AAAC,CAAC,AAC7B,eAAe,CAAE,GAAG,CACpB,kBAAkB,CAAE,GAAG,AACxB,CAAC,AAED,uBAAS,CAAG,iBAAG,WAAW,CAAC,CAAC,AAAC,CAAC,AAC7B,eAAe,CAAE,GAAG,CACpB,kBAAkB,CAAE,GAAG,AACxB,CAAC,AAED,uBAAS,CAAG,iBAAG,WAAW,CAAC,CAAC,AAAC,CAAC,AAC7B,eAAe,CAAE,GAAG,CACpB,kBAAkB,CAAE,GAAG,AACxB,CAAC,AAED,uBAAS,CAAG,iBAAG,WAAW,CAAC,CAAC,AAAC,CAAC,AAC7B,eAAe,CAAE,IAAI,CACrB,kBAAkB,CAAE,GAAG,AACxB,CAAC,AAED,WAAW,0BAAa,CAAC,AACxB,EAAE,AAAC,CAAC,AACH,SAAS,CAAE,YAAY,KAAK,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,AACpC,CAAC,AACD,IAAI,AAAC,CAAC,AACL,SAAS,CAAE,YAAY,IAAI,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,AACnC,CAAC,AACF,CAAC,AAID,MAAM,AAAC,YAAY,KAAK,CAAC,AAAC,CAAC,AAC1B,MAAM,4BAAC,CAAC,AACP,MAAM,CAAE,IAAI,CACZ,UAAU,CAAE,IAAI,AACjB,CAAC,AACD,QAAQ,4BAAC,CAAC,AACT,MAAM,CAAE,IAAI,AACb,CAAC,AACD,EAAE,4BAAC,CAAC,AACH,SAAS,CAAE,IAAI,AAChB,CAAC,AACF,CAAC"}`
};
async function load() {
  const document2 = await client.getByUID("page", "homepage", options);
  return {props: {document: document2}};
}
const Routes = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let {document: document2 = {data: {title: "Loading..."}}} = $$props;
  if ($$props.document === void 0 && $$bindings.document && document2 !== void 0)
    $$bindings.document(document2);
  $$result.css.add(css$1);
  return `<main><div class="${"header svelte-xpllna"}"><div class="${"inner-header flex svelte-xpllna"}"><h1 class="${"svelte-xpllna"}">${escape(document2.data.title)}</h1></div>

		<div><svg class="${"waves svelte-xpllna"}" xmlns="${"http://www.w3.org/2000/svg"}" xmlns:xlink="${"http://www.w3.org/1999/xlink"}" viewBox="${"0 24 150 28"}" preserveAspectRatio="${"none"}" shape-rendering="${"auto"}"><defs><path id="${"gentle-wave"}" d="${"M-160 44c30 0 58-18 88-18s 58 18 88 18 58-18 88-18 58 18 88 18 v44h-352z"}"></path></defs><g class="${"parallax svelte-xpllna"}"><use xlink:href="${"#gentle-wave"}" x="${"48"}" y="${"0"}" fill="${"rgba(255,255,255,0.7"}" class="${"svelte-xpllna"}"></use><use xlink:href="${"#gentle-wave"}" x="${"48"}" y="${"3"}" fill="${"rgba(255,255,255,0.5)"}" class="${"svelte-xpllna"}"></use><use xlink:href="${"#gentle-wave"}" x="${"48"}" y="${"5"}" fill="${"rgba(255,255,255,0.3)"}" class="${"svelte-xpllna"}"></use><use xlink:href="${"#gentle-wave"}" x="${"48"}" y="${"7"}" fill="${"#fff"}" class="${"svelte-xpllna"}"></use></g></svg></div></div>

	<div class="${"content flex svelte-xpllna"}"><p class="${"svelte-xpllna"}">Alex Davis | ${escape(new Date().getFullYear())}</p></div>
	<div class="${"container"}"><div class="${"text"}">${PrismicDom.RichText.asHtml(document2.data.content)}</div></div>
</main>`;
});
var index = /* @__PURE__ */ Object.freeze({
  __proto__: null,
  [Symbol.toStringTag]: "Module",
  default: Routes,
  load
});
var reset = "body {\n  margin: 0;\n  padding: 0;\n}\n\n* {\n  box-sizing: border-box;\n}";
var globals = '@import url(//fonts.googleapis.com/css?family=Lato:300:400);\n*, *::after, *::before {\n  box-sizing: inherit;\n}\n* {\n  font: inherit;\n}\nhtml, body, div, span, applet, object, iframe,\nh1, h2, h3, h4, h5, h6, p, blockquote, pre,\na, abbr, acronym, address, big, cite, code,\ndel, dfn, em, img, ins, kbd, q, s, samp,\nsmall, strike, strong, sub, sup, tt, var,\nb, u, i, center,\ndl, dt, dd, ol, ul, li,\nfieldset, form, label, legend,\ntable, caption, tbody, tfoot, thead, tr, th, td,\narticle, aside, canvas, details, embed,\nfigure, figcaption, footer, header, hgroup,\nmenu, nav, output, ruby, section, summary,\ntime, mark, audio, video, hr {\n  margin: 0;\n  padding: 0;\n  border: 0;\n}\nhtml {\n  box-sizing: border-box;\n}\nbody {\n  background-color: var(--color-bg, white);\n}\narticle, aside, details, figcaption, figure,\nfooter, header, hgroup, menu, nav, section, main, form legend {\n  display: block;\n}\nol, ul {\n  list-style: none;\n}\nblockquote, q {\n  quotes: none;\n}\nbutton, input, textarea, select {\n  margin: 0;\n}\n.btn, .form-control, .link, .reset {\n  background-color: transparent;\n  padding: 0;\n  border: 0;\n  border-radius: 0;\n  color: inherit;\n  line-height: inherit;\n  appearance: none;\n}\nselect.form-control::-ms-expand {\n  display: none;\n}\ntextarea {\n  resize: vertical;\n  overflow: auto;\n  vertical-align: top;\n}\ninput::-ms-clear {\n  display: none;\n}\ntable {\n  border-collapse: collapse;\n  border-spacing: 0;\n}\nimg, video, svg {\n  max-width: 100%;\n}\n[data-theme] {\n  background-color: var(--color-bg, white);\n  color: var(--color-contrast-high, #313135);\n}\n:root {\n  --space-unit: 1em;\n}\n:root, * {\n  --space-xxxxs: calc(0.125 * var(--space-unit));\n  --space-xxxs: calc(0.25 * var(--space-unit));\n  --space-xxs: calc(0.375 * var(--space-unit));\n  --space-xs: calc(0.5 * var(--space-unit));\n  --space-sm: calc(0.75 * var(--space-unit));\n  --space-md: calc(1.25 * var(--space-unit));\n  --space-lg: calc(2 * var(--space-unit));\n  --space-xl: calc(3.25 * var(--space-unit));\n  --space-xxl: calc(5.25 * var(--space-unit));\n  --space-xxxl: calc(8.5 * var(--space-unit));\n  --space-xxxxl: calc(13.75 * var(--space-unit));\n  --component-padding: var(--space-md);\n}\n.container {\n  width: calc(100% - 2*var(--component-padding));\n  margin-left: auto;\n  margin-right: auto;\n}\n.grid {\n  --gap: 0px;\n  --gap-x: var(--gap);\n  --gap-y: var(--gap);\n  --offset: var(--gap-x);\n  display: flex;\n  flex-wrap: wrap;\n}\n.grid > * {\n  flex-basis: 100%;\n  max-width: 100%;\n  min-width: 0;\n}\n/* #region (fallback for older browsers) */\n[class*=gap-xxxxs], [class*=gap-xxxs], [class*=gap-xxs], [class*=gap-xs], [class*=gap-sm], [class*=gap-md], [class*=gap-lg], [class*=gap-xl], [class*=gap-xxl], [class*=gap-xxxl], [class*=gap-xxxxl], [class*=grid-gap-], [class*=flex-gap-] {\n  margin-bottom: -0.75em;\n  margin-left: -0.75em;\n}\n[class*=gap-xxxxs] > *, [class*=gap-xxxs] > *, [class*=gap-xxs] > *, [class*=gap-xs] > *, [class*=gap-sm] > *, [class*=gap-md] > *, [class*=gap-lg] > *, [class*=gap-xl] > *, [class*=gap-xxl] > *, [class*=gap-xxxl] > *, [class*=gap-xxxxl] > *, [class*=grid-gap-] > *, [class*=flex-gap-] > * {\n  margin-bottom: 0.75em;\n  margin-left: 0.75em;\n}\n[class*=gap-x-xxxxs], [class*=gap-x-xxxs], [class*=gap-x-xxs], [class*=gap-x-xs], [class*=gap-x-sm], [class*=gap-x-md], [class*=gap-x-lg], [class*=gap-x-xl], [class*=gap-x-xxl], [class*=gap-x-xxxl], [class*=gap-x-xxxxl] {\n  margin-left: -0.75em;\n}\n[class*=gap-x-xxxxs] > *, [class*=gap-x-xxxs] > *, [class*=gap-x-xxs] > *, [class*=gap-x-xs] > *, [class*=gap-x-sm] > *, [class*=gap-x-md] > *, [class*=gap-x-lg] > *, [class*=gap-x-xl] > *, [class*=gap-x-xxl] > *, [class*=gap-x-xxxl] > *, [class*=gap-x-xxxxl] > * {\n  margin-left: 0.75em;\n}\n[class*=gap-y-xxxxs], [class*=gap-y-xxxs], [class*=gap-y-xxs], [class*=gap-y-xs], [class*=gap-y-sm], [class*=gap-y-md], [class*=gap-y-lg], [class*=gap-y-xl], [class*=gap-y-xxl], [class*=gap-y-xxxl], [class*=gap-y-xxxxl] {\n  margin-bottom: -0.75em;\n}\n[class*=gap-y-xxxxs] > *, [class*=gap-y-xxxs] > *, [class*=gap-y-xxs] > *, [class*=gap-y-xs] > *, [class*=gap-y-sm] > *, [class*=gap-y-md] > *, [class*=gap-y-lg] > *, [class*=gap-y-xl] > *, [class*=gap-y-xxl] > *, [class*=gap-y-xxxl] > *, [class*=gap-y-xxxxl] > * {\n  margin-bottom: 0.75em;\n}\n/* #endregion */\n@supports (--css: variables) {\n  .grid {\n    margin-bottom: calc(-1 * var(--gap-y));\n    margin-left: calc(-1 * var(--gap-x));\n  }\n  .grid > * {\n    margin-bottom: var(--gap-y);\n    margin-left: var(--offset);\n  }\n\n  .flex[class*=gap-], .inline-flex[class*=gap-] {\n    margin-bottom: calc(-1 * var(--gap-y, 0));\n    margin-left: calc(-1 * var(--gap-x, 0));\n  }\n  .flex[class*=gap-] > *, .inline-flex[class*=gap-] > * {\n    margin-bottom: var(--gap-y, 0);\n    margin-left: var(--gap-x, 0);\n  }\n\n  .gap-xxxxs, .grid-gap-xxxxs, .flex-gap-xxxxs {\n    --gap-x: var(--space-xxxxs);\n    --gap-y: var(--space-xxxxs);\n  }\n\n  .gap-xxxs, .grid-gap-xxxs, .flex-gap-xxxs {\n    --gap-x: var(--space-xxxs);\n    --gap-y: var(--space-xxxs);\n  }\n\n  .gap-xxs, .grid-gap-xxs, .flex-gap-xxs {\n    --gap-x: var(--space-xxs);\n    --gap-y: var(--space-xxs);\n  }\n\n  .gap-xs, .grid-gap-xs, .flex-gap-xs {\n    --gap-x: var(--space-xs);\n    --gap-y: var(--space-xs);\n  }\n\n  .gap-sm, .grid-gap-sm, .flex-gap-sm {\n    --gap-x: var(--space-sm);\n    --gap-y: var(--space-sm);\n  }\n\n  .gap-md, .grid-gap-md, .flex-gap-md {\n    --gap-x: var(--space-md);\n    --gap-y: var(--space-md);\n  }\n\n  .gap-lg, .grid-gap-lg, .flex-gap-lg {\n    --gap-x: var(--space-lg);\n    --gap-y: var(--space-lg);\n  }\n\n  .gap-xl, .grid-gap-xl, .flex-gap-xl {\n    --gap-x: var(--space-xl);\n    --gap-y: var(--space-xl);\n  }\n\n  .gap-xxl, .grid-gap-xxl, .flex-gap-xxl {\n    --gap-x: var(--space-xxl);\n    --gap-y: var(--space-xxl);\n  }\n\n  .gap-xxxl, .grid-gap-xxxl, .flex-gap-xxxl {\n    --gap-x: var(--space-xxxl);\n    --gap-y: var(--space-xxxl);\n  }\n\n  .gap-xxxxl, .grid-gap-xxxxl, .flex-gap-xxxxl {\n    --gap-x: var(--space-xxxxl);\n    --gap-y: var(--space-xxxxl);\n  }\n\n  .gap-x-xxxxs {\n    --gap-x: var(--space-xxxxs);\n  }\n\n  .gap-x-xxxs {\n    --gap-x: var(--space-xxxs);\n  }\n\n  .gap-x-xxs {\n    --gap-x: var(--space-xxs);\n  }\n\n  .gap-x-xs {\n    --gap-x: var(--space-xs);\n  }\n\n  .gap-x-sm {\n    --gap-x: var(--space-sm);\n  }\n\n  .gap-x-md {\n    --gap-x: var(--space-md);\n  }\n\n  .gap-x-lg {\n    --gap-x: var(--space-lg);\n  }\n\n  .gap-x-xl {\n    --gap-x: var(--space-xl);\n  }\n\n  .gap-x-xxl {\n    --gap-x: var(--space-xxl);\n  }\n\n  .gap-x-xxxl {\n    --gap-x: var(--space-xxxl);\n  }\n\n  .gap-x-xxxxl {\n    --gap-x: var(--space-xxxxl);\n  }\n\n  .gap-y-xxxxs {\n    --gap-y: var(--space-xxxxs);\n  }\n\n  .gap-y-xxxs {\n    --gap-y: var(--space-xxxs);\n  }\n\n  .gap-y-xxs {\n    --gap-y: var(--space-xxs);\n  }\n\n  .gap-y-xs {\n    --gap-y: var(--space-xs);\n  }\n\n  .gap-y-sm {\n    --gap-y: var(--space-sm);\n  }\n\n  .gap-y-md {\n    --gap-y: var(--space-md);\n  }\n\n  .gap-y-lg {\n    --gap-y: var(--space-lg);\n  }\n\n  .gap-y-xl {\n    --gap-y: var(--space-xl);\n  }\n\n  .gap-y-xxl {\n    --gap-y: var(--space-xxl);\n  }\n\n  .gap-y-xxxl {\n    --gap-y: var(--space-xxxl);\n  }\n\n  .gap-y-xxxxl {\n    --gap-y: var(--space-xxxxl);\n  }\n}\n.col {\n  flex-grow: 1;\n  flex-basis: 0;\n  max-width: 100%;\n}\n.col-1 {\n  flex-basis: calc( 8.33% - 0.01px - var(--gap-x, 0.75em));\n  max-width: calc( 8.33% - 0.01px - var(--gap-x, 0.75em));\n}\n.col-2 {\n  flex-basis: calc( 16.66% - 0.01px - var(--gap-x, 0.75em));\n  max-width: calc( 16.66% - 0.01px - var(--gap-x, 0.75em));\n}\n.col-3 {\n  flex-basis: calc( 25% - 0.01px - var(--gap-x, 0.75em));\n  max-width: calc( 25% - 0.01px - var(--gap-x, 0.75em));\n}\n.col-4 {\n  flex-basis: calc( 33.33% - 0.01px - var(--gap-x, 0.75em));\n  max-width: calc( 33.33% - 0.01px - var(--gap-x, 0.75em));\n}\n.col-5 {\n  flex-basis: calc( 41.66% - 0.01px - var(--gap-x, 0.75em));\n  max-width: calc( 41.66% - 0.01px - var(--gap-x, 0.75em));\n}\n.col-6 {\n  flex-basis: calc( 50% - 0.01px - var(--gap-x, 0.75em));\n  max-width: calc( 50% - 0.01px - var(--gap-x, 0.75em));\n}\n.col-7 {\n  flex-basis: calc( 58.33% - 0.01px - var(--gap-x, 0.75em));\n  max-width: calc( 58.33% - 0.01px - var(--gap-x, 0.75em));\n}\n.col-8 {\n  flex-basis: calc( 66.66% - 0.01px - var(--gap-x, 0.75em));\n  max-width: calc( 66.66% - 0.01px - var(--gap-x, 0.75em));\n}\n.col-9 {\n  flex-basis: calc( 75% - 0.01px - var(--gap-x, 0.75em));\n  max-width: calc( 75% - 0.01px - var(--gap-x, 0.75em));\n}\n.col-10 {\n  flex-basis: calc( 83.33% - 0.01px - var(--gap-x, 0.75em));\n  max-width: calc( 83.33% - 0.01px - var(--gap-x, 0.75em));\n}\n.col-11 {\n  flex-basis: calc( 91.66% - 0.01px - var(--gap-x, 0.75em));\n  max-width: calc( 91.66% - 0.01px - var(--gap-x, 0.75em));\n}\n.col-12 {\n  flex-basis: calc( 100% - 0.01px - var(--gap-x, 0.75em));\n  max-width: calc( 100% - 0.01px - var(--gap-x, 0.75em));\n}\n.col-content {\n  flex-grow: 0;\n  flex-basis: initial;\n  max-width: initial;\n}\n.offset-1 {\n  --offset: calc(8.33% + var(--gap-x, 0.75em));\n}\n.offset-2 {\n  --offset: calc(16.66% + var(--gap-x, 0.75em));\n}\n.offset-3 {\n  --offset: calc(25% + var(--gap-x, 0.75em));\n}\n.offset-4 {\n  --offset: calc(33.33% + var(--gap-x, 0.75em));\n}\n.offset-5 {\n  --offset: calc(41.66% + var(--gap-x, 0.75em));\n}\n.offset-6 {\n  --offset: calc(50% + var(--gap-x, 0.75em));\n}\n.offset-7 {\n  --offset: calc(58.33% + var(--gap-x, 0.75em));\n}\n.offset-8 {\n  --offset: calc(66.66% + var(--gap-x, 0.75em));\n}\n.offset-9 {\n  --offset: calc(75% + var(--gap-x, 0.75em));\n}\n.offset-10 {\n  --offset: calc(83.33% + var(--gap-x, 0.75em));\n}\n.offset-11 {\n  --offset: calc(91.66% + var(--gap-x, 0.75em));\n}\n@media (min-width: 32rem) {\n  .col\\@xs {\n    flex-grow: 1;\n    flex-basis: 0;\n    max-width: 100%;\n  }\n\n  .col-1\\@xs {\n    flex-basis: calc( 8.33% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 8.33% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-2\\@xs {\n    flex-basis: calc( 16.66% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 16.66% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-3\\@xs {\n    flex-basis: calc( 25% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 25% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-4\\@xs {\n    flex-basis: calc( 33.33% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 33.33% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-5\\@xs {\n    flex-basis: calc( 41.66% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 41.66% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-6\\@xs {\n    flex-basis: calc( 50% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 50% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-7\\@xs {\n    flex-basis: calc( 58.33% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 58.33% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-8\\@xs {\n    flex-basis: calc( 66.66% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 66.66% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-9\\@xs {\n    flex-basis: calc( 75% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 75% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-10\\@xs {\n    flex-basis: calc( 83.33% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 83.33% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-11\\@xs {\n    flex-basis: calc( 91.66% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 91.66% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-12\\@xs {\n    flex-basis: calc( 100% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 100% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-content\\@xs {\n    flex-grow: 0;\n    flex-basis: initial;\n    max-width: initial;\n  }\n\n  .offset-1\\@xs {\n    --offset: calc(8.33% + var(--gap-x, 0.75em));\n  }\n\n  .offset-2\\@xs {\n    --offset: calc(16.66% + var(--gap-x, 0.75em));\n  }\n\n  .offset-3\\@xs {\n    --offset: calc(25% + var(--gap-x, 0.75em));\n  }\n\n  .offset-4\\@xs {\n    --offset: calc(33.33% + var(--gap-x, 0.75em));\n  }\n\n  .offset-5\\@xs {\n    --offset: calc(41.66% + var(--gap-x, 0.75em));\n  }\n\n  .offset-6\\@xs {\n    --offset: calc(50% + var(--gap-x, 0.75em));\n  }\n\n  .offset-7\\@xs {\n    --offset: calc(58.33% + var(--gap-x, 0.75em));\n  }\n\n  .offset-8\\@xs {\n    --offset: calc(66.66% + var(--gap-x, 0.75em));\n  }\n\n  .offset-9\\@xs {\n    --offset: calc(75% + var(--gap-x, 0.75em));\n  }\n\n  .offset-10\\@xs {\n    --offset: calc(83.33% + var(--gap-x, 0.75em));\n  }\n\n  .offset-11\\@xs {\n    --offset: calc(91.66% + var(--gap-x, 0.75em));\n  }\n\n  .offset-0\\@xs {\n    --offset: var(--gap-x);\n  }\n\n  @supports (--css: variables) {\n    .gap-xxxxs\\@xs {\n      --gap-x: var(--space-xxxxs);\n      --gap-y: var(--space-xxxxs);\n    }\n\n    .gap-xxxs\\@xs {\n      --gap-x: var(--space-xxxs);\n      --gap-y: var(--space-xxxs);\n    }\n\n    .gap-xxs\\@xs {\n      --gap-x: var(--space-xxs);\n      --gap-y: var(--space-xxs);\n    }\n\n    .gap-xs\\@xs {\n      --gap-x: var(--space-xs);\n      --gap-y: var(--space-xs);\n    }\n\n    .gap-sm\\@xs {\n      --gap-x: var(--space-sm);\n      --gap-y: var(--space-sm);\n    }\n\n    .gap-md\\@xs {\n      --gap-x: var(--space-md);\n      --gap-y: var(--space-md);\n    }\n\n    .gap-lg\\@xs {\n      --gap-x: var(--space-lg);\n      --gap-y: var(--space-lg);\n    }\n\n    .gap-xl\\@xs {\n      --gap-x: var(--space-xl);\n      --gap-y: var(--space-xl);\n    }\n\n    .gap-xxl\\@xs {\n      --gap-x: var(--space-xxl);\n      --gap-y: var(--space-xxl);\n    }\n\n    .gap-xxxl\\@xs {\n      --gap-x: var(--space-xxxl);\n      --gap-y: var(--space-xxxl);\n    }\n\n    .gap-xxxxl\\@xs {\n      --gap-x: var(--space-xxxxl);\n      --gap-y: var(--space-xxxxl);\n    }\n\n    .gap-0\\@xs {\n      --gap-x: 0px;\n      --gap-y: 0px;\n    }\n\n    .gap-x-xxxxs\\@xs {\n      --gap-x: var(--space-xxxxs);\n    }\n\n    .gap-x-xxxs\\@xs {\n      --gap-x: var(--space-xxxs);\n    }\n\n    .gap-x-xxs\\@xs {\n      --gap-x: var(--space-xxs);\n    }\n\n    .gap-x-xs\\@xs {\n      --gap-x: var(--space-xs);\n    }\n\n    .gap-x-sm\\@xs {\n      --gap-x: var(--space-sm);\n    }\n\n    .gap-x-md\\@xs {\n      --gap-x: var(--space-md);\n    }\n\n    .gap-x-lg\\@xs {\n      --gap-x: var(--space-lg);\n    }\n\n    .gap-x-xl\\@xs {\n      --gap-x: var(--space-xl);\n    }\n\n    .gap-x-xxl\\@xs {\n      --gap-x: var(--space-xxl);\n    }\n\n    .gap-x-xxxl\\@xs {\n      --gap-x: var(--space-xxxl);\n    }\n\n    .gap-x-xxxxl\\@xs {\n      --gap-x: var(--space-xxxxl);\n    }\n\n    .gap-x-0\\@xs {\n      --gap-x: 0px;\n    }\n\n    .gap-y-xxxxs\\@xs {\n      --gap-y: var(--space-xxxxs);\n    }\n\n    .gap-y-xxxs\\@xs {\n      --gap-y: var(--space-xxxs);\n    }\n\n    .gap-y-xxs\\@xs {\n      --gap-y: var(--space-xxs);\n    }\n\n    .gap-y-xs\\@xs {\n      --gap-y: var(--space-xs);\n    }\n\n    .gap-y-sm\\@xs {\n      --gap-y: var(--space-sm);\n    }\n\n    .gap-y-md\\@xs {\n      --gap-y: var(--space-md);\n    }\n\n    .gap-y-lg\\@xs {\n      --gap-y: var(--space-lg);\n    }\n\n    .gap-y-xl\\@xs {\n      --gap-y: var(--space-xl);\n    }\n\n    .gap-y-xxl\\@xs {\n      --gap-y: var(--space-xxl);\n    }\n\n    .gap-y-xxxl\\@xs {\n      --gap-y: var(--space-xxxl);\n    }\n\n    .gap-y-xxxxl\\@xs {\n      --gap-y: var(--space-xxxxl);\n    }\n\n    .gap-y-0\\@xs {\n      --gap-y: 0px;\n    }\n  }\n}\n@media (min-width: 48rem) {\n  .col\\@sm {\n    flex-grow: 1;\n    flex-basis: 0;\n    max-width: 100%;\n  }\n\n  .col-1\\@sm {\n    flex-basis: calc( 8.33% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 8.33% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-2\\@sm {\n    flex-basis: calc( 16.66% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 16.66% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-3\\@sm {\n    flex-basis: calc( 25% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 25% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-4\\@sm {\n    flex-basis: calc( 33.33% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 33.33% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-5\\@sm {\n    flex-basis: calc( 41.66% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 41.66% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-6\\@sm {\n    flex-basis: calc( 50% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 50% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-7\\@sm {\n    flex-basis: calc( 58.33% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 58.33% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-8\\@sm {\n    flex-basis: calc( 66.66% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 66.66% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-9\\@sm {\n    flex-basis: calc( 75% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 75% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-10\\@sm {\n    flex-basis: calc( 83.33% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 83.33% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-11\\@sm {\n    flex-basis: calc( 91.66% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 91.66% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-12\\@sm {\n    flex-basis: calc( 100% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 100% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-content\\@sm {\n    flex-grow: 0;\n    flex-basis: initial;\n    max-width: initial;\n  }\n\n  .offset-1\\@sm {\n    --offset: calc(8.33% + var(--gap-x, 0.75em));\n  }\n\n  .offset-2\\@sm {\n    --offset: calc(16.66% + var(--gap-x, 0.75em));\n  }\n\n  .offset-3\\@sm {\n    --offset: calc(25% + var(--gap-x, 0.75em));\n  }\n\n  .offset-4\\@sm {\n    --offset: calc(33.33% + var(--gap-x, 0.75em));\n  }\n\n  .offset-5\\@sm {\n    --offset: calc(41.66% + var(--gap-x, 0.75em));\n  }\n\n  .offset-6\\@sm {\n    --offset: calc(50% + var(--gap-x, 0.75em));\n  }\n\n  .offset-7\\@sm {\n    --offset: calc(58.33% + var(--gap-x, 0.75em));\n  }\n\n  .offset-8\\@sm {\n    --offset: calc(66.66% + var(--gap-x, 0.75em));\n  }\n\n  .offset-9\\@sm {\n    --offset: calc(75% + var(--gap-x, 0.75em));\n  }\n\n  .offset-10\\@sm {\n    --offset: calc(83.33% + var(--gap-x, 0.75em));\n  }\n\n  .offset-11\\@sm {\n    --offset: calc(91.66% + var(--gap-x, 0.75em));\n  }\n\n  .offset-0\\@sm {\n    --offset: var(--gap-x);\n  }\n\n  @supports (--css: variables) {\n    .gap-xxxxs\\@sm {\n      --gap-x: var(--space-xxxxs);\n      --gap-y: var(--space-xxxxs);\n    }\n\n    .gap-xxxs\\@sm {\n      --gap-x: var(--space-xxxs);\n      --gap-y: var(--space-xxxs);\n    }\n\n    .gap-xxs\\@sm {\n      --gap-x: var(--space-xxs);\n      --gap-y: var(--space-xxs);\n    }\n\n    .gap-xs\\@sm {\n      --gap-x: var(--space-xs);\n      --gap-y: var(--space-xs);\n    }\n\n    .gap-sm\\@sm {\n      --gap-x: var(--space-sm);\n      --gap-y: var(--space-sm);\n    }\n\n    .gap-md\\@sm {\n      --gap-x: var(--space-md);\n      --gap-y: var(--space-md);\n    }\n\n    .gap-lg\\@sm {\n      --gap-x: var(--space-lg);\n      --gap-y: var(--space-lg);\n    }\n\n    .gap-xl\\@sm {\n      --gap-x: var(--space-xl);\n      --gap-y: var(--space-xl);\n    }\n\n    .gap-xxl\\@sm {\n      --gap-x: var(--space-xxl);\n      --gap-y: var(--space-xxl);\n    }\n\n    .gap-xxxl\\@sm {\n      --gap-x: var(--space-xxxl);\n      --gap-y: var(--space-xxxl);\n    }\n\n    .gap-xxxxl\\@sm {\n      --gap-x: var(--space-xxxxl);\n      --gap-y: var(--space-xxxxl);\n    }\n\n    .gap-0\\@sm {\n      --gap-x: 0px;\n      --gap-y: 0px;\n    }\n\n    .gap-x-xxxxs\\@sm {\n      --gap-x: var(--space-xxxxs);\n    }\n\n    .gap-x-xxxs\\@sm {\n      --gap-x: var(--space-xxxs);\n    }\n\n    .gap-x-xxs\\@sm {\n      --gap-x: var(--space-xxs);\n    }\n\n    .gap-x-xs\\@sm {\n      --gap-x: var(--space-xs);\n    }\n\n    .gap-x-sm\\@sm {\n      --gap-x: var(--space-sm);\n    }\n\n    .gap-x-md\\@sm {\n      --gap-x: var(--space-md);\n    }\n\n    .gap-x-lg\\@sm {\n      --gap-x: var(--space-lg);\n    }\n\n    .gap-x-xl\\@sm {\n      --gap-x: var(--space-xl);\n    }\n\n    .gap-x-xxl\\@sm {\n      --gap-x: var(--space-xxl);\n    }\n\n    .gap-x-xxxl\\@sm {\n      --gap-x: var(--space-xxxl);\n    }\n\n    .gap-x-xxxxl\\@sm {\n      --gap-x: var(--space-xxxxl);\n    }\n\n    .gap-x-0\\@sm {\n      --gap-x: 0px;\n    }\n\n    .gap-y-xxxxs\\@sm {\n      --gap-y: var(--space-xxxxs);\n    }\n\n    .gap-y-xxxs\\@sm {\n      --gap-y: var(--space-xxxs);\n    }\n\n    .gap-y-xxs\\@sm {\n      --gap-y: var(--space-xxs);\n    }\n\n    .gap-y-xs\\@sm {\n      --gap-y: var(--space-xs);\n    }\n\n    .gap-y-sm\\@sm {\n      --gap-y: var(--space-sm);\n    }\n\n    .gap-y-md\\@sm {\n      --gap-y: var(--space-md);\n    }\n\n    .gap-y-lg\\@sm {\n      --gap-y: var(--space-lg);\n    }\n\n    .gap-y-xl\\@sm {\n      --gap-y: var(--space-xl);\n    }\n\n    .gap-y-xxl\\@sm {\n      --gap-y: var(--space-xxl);\n    }\n\n    .gap-y-xxxl\\@sm {\n      --gap-y: var(--space-xxxl);\n    }\n\n    .gap-y-xxxxl\\@sm {\n      --gap-y: var(--space-xxxxl);\n    }\n\n    .gap-y-0\\@sm {\n      --gap-y: 0px;\n    }\n  }\n}\n@media (min-width: 64rem) {\n  .col\\@md {\n    flex-grow: 1;\n    flex-basis: 0;\n    max-width: 100%;\n  }\n\n  .col-1\\@md {\n    flex-basis: calc( 8.33% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 8.33% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-2\\@md {\n    flex-basis: calc( 16.66% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 16.66% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-3\\@md {\n    flex-basis: calc( 25% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 25% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-4\\@md {\n    flex-basis: calc( 33.33% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 33.33% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-5\\@md {\n    flex-basis: calc( 41.66% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 41.66% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-6\\@md {\n    flex-basis: calc( 50% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 50% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-7\\@md {\n    flex-basis: calc( 58.33% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 58.33% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-8\\@md {\n    flex-basis: calc( 66.66% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 66.66% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-9\\@md {\n    flex-basis: calc( 75% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 75% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-10\\@md {\n    flex-basis: calc( 83.33% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 83.33% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-11\\@md {\n    flex-basis: calc( 91.66% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 91.66% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-12\\@md {\n    flex-basis: calc( 100% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 100% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-content\\@md {\n    flex-grow: 0;\n    flex-basis: initial;\n    max-width: initial;\n  }\n\n  .offset-1\\@md {\n    --offset: calc(8.33% + var(--gap-x, 0.75em));\n  }\n\n  .offset-2\\@md {\n    --offset: calc(16.66% + var(--gap-x, 0.75em));\n  }\n\n  .offset-3\\@md {\n    --offset: calc(25% + var(--gap-x, 0.75em));\n  }\n\n  .offset-4\\@md {\n    --offset: calc(33.33% + var(--gap-x, 0.75em));\n  }\n\n  .offset-5\\@md {\n    --offset: calc(41.66% + var(--gap-x, 0.75em));\n  }\n\n  .offset-6\\@md {\n    --offset: calc(50% + var(--gap-x, 0.75em));\n  }\n\n  .offset-7\\@md {\n    --offset: calc(58.33% + var(--gap-x, 0.75em));\n  }\n\n  .offset-8\\@md {\n    --offset: calc(66.66% + var(--gap-x, 0.75em));\n  }\n\n  .offset-9\\@md {\n    --offset: calc(75% + var(--gap-x, 0.75em));\n  }\n\n  .offset-10\\@md {\n    --offset: calc(83.33% + var(--gap-x, 0.75em));\n  }\n\n  .offset-11\\@md {\n    --offset: calc(91.66% + var(--gap-x, 0.75em));\n  }\n\n  .offset-0\\@md {\n    --offset: var(--gap-x);\n  }\n\n  @supports (--css: variables) {\n    .gap-xxxxs\\@md {\n      --gap-x: var(--space-xxxxs);\n      --gap-y: var(--space-xxxxs);\n    }\n\n    .gap-xxxs\\@md {\n      --gap-x: var(--space-xxxs);\n      --gap-y: var(--space-xxxs);\n    }\n\n    .gap-xxs\\@md {\n      --gap-x: var(--space-xxs);\n      --gap-y: var(--space-xxs);\n    }\n\n    .gap-xs\\@md {\n      --gap-x: var(--space-xs);\n      --gap-y: var(--space-xs);\n    }\n\n    .gap-sm\\@md {\n      --gap-x: var(--space-sm);\n      --gap-y: var(--space-sm);\n    }\n\n    .gap-md\\@md {\n      --gap-x: var(--space-md);\n      --gap-y: var(--space-md);\n    }\n\n    .gap-lg\\@md {\n      --gap-x: var(--space-lg);\n      --gap-y: var(--space-lg);\n    }\n\n    .gap-xl\\@md {\n      --gap-x: var(--space-xl);\n      --gap-y: var(--space-xl);\n    }\n\n    .gap-xxl\\@md {\n      --gap-x: var(--space-xxl);\n      --gap-y: var(--space-xxl);\n    }\n\n    .gap-xxxl\\@md {\n      --gap-x: var(--space-xxxl);\n      --gap-y: var(--space-xxxl);\n    }\n\n    .gap-xxxxl\\@md {\n      --gap-x: var(--space-xxxxl);\n      --gap-y: var(--space-xxxxl);\n    }\n\n    .gap-0\\@md {\n      --gap-x: 0px;\n      --gap-y: 0px;\n    }\n\n    .gap-x-xxxxs\\@md {\n      --gap-x: var(--space-xxxxs);\n    }\n\n    .gap-x-xxxs\\@md {\n      --gap-x: var(--space-xxxs);\n    }\n\n    .gap-x-xxs\\@md {\n      --gap-x: var(--space-xxs);\n    }\n\n    .gap-x-xs\\@md {\n      --gap-x: var(--space-xs);\n    }\n\n    .gap-x-sm\\@md {\n      --gap-x: var(--space-sm);\n    }\n\n    .gap-x-md\\@md {\n      --gap-x: var(--space-md);\n    }\n\n    .gap-x-lg\\@md {\n      --gap-x: var(--space-lg);\n    }\n\n    .gap-x-xl\\@md {\n      --gap-x: var(--space-xl);\n    }\n\n    .gap-x-xxl\\@md {\n      --gap-x: var(--space-xxl);\n    }\n\n    .gap-x-xxxl\\@md {\n      --gap-x: var(--space-xxxl);\n    }\n\n    .gap-x-xxxxl\\@md {\n      --gap-x: var(--space-xxxxl);\n    }\n\n    .gap-x-0\\@md {\n      --gap-x: 0px;\n    }\n\n    .gap-y-xxxxs\\@md {\n      --gap-y: var(--space-xxxxs);\n    }\n\n    .gap-y-xxxs\\@md {\n      --gap-y: var(--space-xxxs);\n    }\n\n    .gap-y-xxs\\@md {\n      --gap-y: var(--space-xxs);\n    }\n\n    .gap-y-xs\\@md {\n      --gap-y: var(--space-xs);\n    }\n\n    .gap-y-sm\\@md {\n      --gap-y: var(--space-sm);\n    }\n\n    .gap-y-md\\@md {\n      --gap-y: var(--space-md);\n    }\n\n    .gap-y-lg\\@md {\n      --gap-y: var(--space-lg);\n    }\n\n    .gap-y-xl\\@md {\n      --gap-y: var(--space-xl);\n    }\n\n    .gap-y-xxl\\@md {\n      --gap-y: var(--space-xxl);\n    }\n\n    .gap-y-xxxl\\@md {\n      --gap-y: var(--space-xxxl);\n    }\n\n    .gap-y-xxxxl\\@md {\n      --gap-y: var(--space-xxxxl);\n    }\n\n    .gap-y-0\\@md {\n      --gap-y: 0px;\n    }\n  }\n}\n@media (min-width: 80rem) {\n  .col\\@lg {\n    flex-grow: 1;\n    flex-basis: 0;\n    max-width: 100%;\n  }\n\n  .col-1\\@lg {\n    flex-basis: calc( 8.33% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 8.33% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-2\\@lg {\n    flex-basis: calc( 16.66% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 16.66% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-3\\@lg {\n    flex-basis: calc( 25% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 25% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-4\\@lg {\n    flex-basis: calc( 33.33% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 33.33% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-5\\@lg {\n    flex-basis: calc( 41.66% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 41.66% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-6\\@lg {\n    flex-basis: calc( 50% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 50% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-7\\@lg {\n    flex-basis: calc( 58.33% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 58.33% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-8\\@lg {\n    flex-basis: calc( 66.66% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 66.66% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-9\\@lg {\n    flex-basis: calc( 75% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 75% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-10\\@lg {\n    flex-basis: calc( 83.33% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 83.33% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-11\\@lg {\n    flex-basis: calc( 91.66% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 91.66% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-12\\@lg {\n    flex-basis: calc( 100% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 100% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-content\\@lg {\n    flex-grow: 0;\n    flex-basis: initial;\n    max-width: initial;\n  }\n\n  .offset-1\\@lg {\n    --offset: calc(8.33% + var(--gap-x, 0.75em));\n  }\n\n  .offset-2\\@lg {\n    --offset: calc(16.66% + var(--gap-x, 0.75em));\n  }\n\n  .offset-3\\@lg {\n    --offset: calc(25% + var(--gap-x, 0.75em));\n  }\n\n  .offset-4\\@lg {\n    --offset: calc(33.33% + var(--gap-x, 0.75em));\n  }\n\n  .offset-5\\@lg {\n    --offset: calc(41.66% + var(--gap-x, 0.75em));\n  }\n\n  .offset-6\\@lg {\n    --offset: calc(50% + var(--gap-x, 0.75em));\n  }\n\n  .offset-7\\@lg {\n    --offset: calc(58.33% + var(--gap-x, 0.75em));\n  }\n\n  .offset-8\\@lg {\n    --offset: calc(66.66% + var(--gap-x, 0.75em));\n  }\n\n  .offset-9\\@lg {\n    --offset: calc(75% + var(--gap-x, 0.75em));\n  }\n\n  .offset-10\\@lg {\n    --offset: calc(83.33% + var(--gap-x, 0.75em));\n  }\n\n  .offset-11\\@lg {\n    --offset: calc(91.66% + var(--gap-x, 0.75em));\n  }\n\n  .offset-0\\@lg {\n    --offset: var(--gap-x);\n  }\n\n  @supports (--css: variables) {\n    .gap-xxxxs\\@lg {\n      --gap-x: var(--space-xxxxs);\n      --gap-y: var(--space-xxxxs);\n    }\n\n    .gap-xxxs\\@lg {\n      --gap-x: var(--space-xxxs);\n      --gap-y: var(--space-xxxs);\n    }\n\n    .gap-xxs\\@lg {\n      --gap-x: var(--space-xxs);\n      --gap-y: var(--space-xxs);\n    }\n\n    .gap-xs\\@lg {\n      --gap-x: var(--space-xs);\n      --gap-y: var(--space-xs);\n    }\n\n    .gap-sm\\@lg {\n      --gap-x: var(--space-sm);\n      --gap-y: var(--space-sm);\n    }\n\n    .gap-md\\@lg {\n      --gap-x: var(--space-md);\n      --gap-y: var(--space-md);\n    }\n\n    .gap-lg\\@lg {\n      --gap-x: var(--space-lg);\n      --gap-y: var(--space-lg);\n    }\n\n    .gap-xl\\@lg {\n      --gap-x: var(--space-xl);\n      --gap-y: var(--space-xl);\n    }\n\n    .gap-xxl\\@lg {\n      --gap-x: var(--space-xxl);\n      --gap-y: var(--space-xxl);\n    }\n\n    .gap-xxxl\\@lg {\n      --gap-x: var(--space-xxxl);\n      --gap-y: var(--space-xxxl);\n    }\n\n    .gap-xxxxl\\@lg {\n      --gap-x: var(--space-xxxxl);\n      --gap-y: var(--space-xxxxl);\n    }\n\n    .gap-0\\@lg {\n      --gap-x: 0px;\n      --gap-y: 0px;\n    }\n\n    .gap-x-xxxxs\\@lg {\n      --gap-x: var(--space-xxxxs);\n    }\n\n    .gap-x-xxxs\\@lg {\n      --gap-x: var(--space-xxxs);\n    }\n\n    .gap-x-xxs\\@lg {\n      --gap-x: var(--space-xxs);\n    }\n\n    .gap-x-xs\\@lg {\n      --gap-x: var(--space-xs);\n    }\n\n    .gap-x-sm\\@lg {\n      --gap-x: var(--space-sm);\n    }\n\n    .gap-x-md\\@lg {\n      --gap-x: var(--space-md);\n    }\n\n    .gap-x-lg\\@lg {\n      --gap-x: var(--space-lg);\n    }\n\n    .gap-x-xl\\@lg {\n      --gap-x: var(--space-xl);\n    }\n\n    .gap-x-xxl\\@lg {\n      --gap-x: var(--space-xxl);\n    }\n\n    .gap-x-xxxl\\@lg {\n      --gap-x: var(--space-xxxl);\n    }\n\n    .gap-x-xxxxl\\@lg {\n      --gap-x: var(--space-xxxxl);\n    }\n\n    .gap-x-0\\@lg {\n      --gap-x: 0px;\n    }\n\n    .gap-y-xxxxs\\@lg {\n      --gap-y: var(--space-xxxxs);\n    }\n\n    .gap-y-xxxs\\@lg {\n      --gap-y: var(--space-xxxs);\n    }\n\n    .gap-y-xxs\\@lg {\n      --gap-y: var(--space-xxs);\n    }\n\n    .gap-y-xs\\@lg {\n      --gap-y: var(--space-xs);\n    }\n\n    .gap-y-sm\\@lg {\n      --gap-y: var(--space-sm);\n    }\n\n    .gap-y-md\\@lg {\n      --gap-y: var(--space-md);\n    }\n\n    .gap-y-lg\\@lg {\n      --gap-y: var(--space-lg);\n    }\n\n    .gap-y-xl\\@lg {\n      --gap-y: var(--space-xl);\n    }\n\n    .gap-y-xxl\\@lg {\n      --gap-y: var(--space-xxl);\n    }\n\n    .gap-y-xxxl\\@lg {\n      --gap-y: var(--space-xxxl);\n    }\n\n    .gap-y-xxxxl\\@lg {\n      --gap-y: var(--space-xxxxl);\n    }\n\n    .gap-y-0\\@lg {\n      --gap-y: 0px;\n    }\n  }\n}\n@media (min-width: 90rem) {\n  .col\\@xl {\n    flex-grow: 1;\n    flex-basis: 0;\n    max-width: 100%;\n  }\n\n  .col-1\\@xl {\n    flex-basis: calc( 8.33% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 8.33% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-2\\@xl {\n    flex-basis: calc( 16.66% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 16.66% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-3\\@xl {\n    flex-basis: calc( 25% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 25% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-4\\@xl {\n    flex-basis: calc( 33.33% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 33.33% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-5\\@xl {\n    flex-basis: calc( 41.66% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 41.66% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-6\\@xl {\n    flex-basis: calc( 50% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 50% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-7\\@xl {\n    flex-basis: calc( 58.33% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 58.33% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-8\\@xl {\n    flex-basis: calc( 66.66% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 66.66% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-9\\@xl {\n    flex-basis: calc( 75% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 75% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-10\\@xl {\n    flex-basis: calc( 83.33% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 83.33% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-11\\@xl {\n    flex-basis: calc( 91.66% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 91.66% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-12\\@xl {\n    flex-basis: calc( 100% - 0.01px - var(--gap-x, 0.75em));\n    max-width: calc( 100% - 0.01px - var(--gap-x, 0.75em));\n  }\n\n  .col-content\\@xl {\n    flex-grow: 0;\n    flex-basis: initial;\n    max-width: initial;\n  }\n\n  .offset-1\\@xl {\n    --offset: calc(8.33% + var(--gap-x, 0.75em));\n  }\n\n  .offset-2\\@xl {\n    --offset: calc(16.66% + var(--gap-x, 0.75em));\n  }\n\n  .offset-3\\@xl {\n    --offset: calc(25% + var(--gap-x, 0.75em));\n  }\n\n  .offset-4\\@xl {\n    --offset: calc(33.33% + var(--gap-x, 0.75em));\n  }\n\n  .offset-5\\@xl {\n    --offset: calc(41.66% + var(--gap-x, 0.75em));\n  }\n\n  .offset-6\\@xl {\n    --offset: calc(50% + var(--gap-x, 0.75em));\n  }\n\n  .offset-7\\@xl {\n    --offset: calc(58.33% + var(--gap-x, 0.75em));\n  }\n\n  .offset-8\\@xl {\n    --offset: calc(66.66% + var(--gap-x, 0.75em));\n  }\n\n  .offset-9\\@xl {\n    --offset: calc(75% + var(--gap-x, 0.75em));\n  }\n\n  .offset-10\\@xl {\n    --offset: calc(83.33% + var(--gap-x, 0.75em));\n  }\n\n  .offset-11\\@xl {\n    --offset: calc(91.66% + var(--gap-x, 0.75em));\n  }\n\n  .offset-0\\@xl {\n    --offset: var(--gap-x);\n  }\n\n  @supports (--css: variables) {\n    .gap-xxxxs\\@xl {\n      --gap-x: var(--space-xxxxs);\n      --gap-y: var(--space-xxxxs);\n    }\n\n    .gap-xxxs\\@xl {\n      --gap-x: var(--space-xxxs);\n      --gap-y: var(--space-xxxs);\n    }\n\n    .gap-xxs\\@xl {\n      --gap-x: var(--space-xxs);\n      --gap-y: var(--space-xxs);\n    }\n\n    .gap-xs\\@xl {\n      --gap-x: var(--space-xs);\n      --gap-y: var(--space-xs);\n    }\n\n    .gap-sm\\@xl {\n      --gap-x: var(--space-sm);\n      --gap-y: var(--space-sm);\n    }\n\n    .gap-md\\@xl {\n      --gap-x: var(--space-md);\n      --gap-y: var(--space-md);\n    }\n\n    .gap-lg\\@xl {\n      --gap-x: var(--space-lg);\n      --gap-y: var(--space-lg);\n    }\n\n    .gap-xl\\@xl {\n      --gap-x: var(--space-xl);\n      --gap-y: var(--space-xl);\n    }\n\n    .gap-xxl\\@xl {\n      --gap-x: var(--space-xxl);\n      --gap-y: var(--space-xxl);\n    }\n\n    .gap-xxxl\\@xl {\n      --gap-x: var(--space-xxxl);\n      --gap-y: var(--space-xxxl);\n    }\n\n    .gap-xxxxl\\@xl {\n      --gap-x: var(--space-xxxxl);\n      --gap-y: var(--space-xxxxl);\n    }\n\n    .gap-0\\@xl {\n      --gap-x: 0px;\n      --gap-y: 0px;\n    }\n\n    .gap-x-xxxxs\\@xl {\n      --gap-x: var(--space-xxxxs);\n    }\n\n    .gap-x-xxxs\\@xl {\n      --gap-x: var(--space-xxxs);\n    }\n\n    .gap-x-xxs\\@xl {\n      --gap-x: var(--space-xxs);\n    }\n\n    .gap-x-xs\\@xl {\n      --gap-x: var(--space-xs);\n    }\n\n    .gap-x-sm\\@xl {\n      --gap-x: var(--space-sm);\n    }\n\n    .gap-x-md\\@xl {\n      --gap-x: var(--space-md);\n    }\n\n    .gap-x-lg\\@xl {\n      --gap-x: var(--space-lg);\n    }\n\n    .gap-x-xl\\@xl {\n      --gap-x: var(--space-xl);\n    }\n\n    .gap-x-xxl\\@xl {\n      --gap-x: var(--space-xxl);\n    }\n\n    .gap-x-xxxl\\@xl {\n      --gap-x: var(--space-xxxl);\n    }\n\n    .gap-x-xxxxl\\@xl {\n      --gap-x: var(--space-xxxxl);\n    }\n\n    .gap-x-0\\@xl {\n      --gap-x: 0px;\n    }\n\n    .gap-y-xxxxs\\@xl {\n      --gap-y: var(--space-xxxxs);\n    }\n\n    .gap-y-xxxs\\@xl {\n      --gap-y: var(--space-xxxs);\n    }\n\n    .gap-y-xxs\\@xl {\n      --gap-y: var(--space-xxs);\n    }\n\n    .gap-y-xs\\@xl {\n      --gap-y: var(--space-xs);\n    }\n\n    .gap-y-sm\\@xl {\n      --gap-y: var(--space-sm);\n    }\n\n    .gap-y-md\\@xl {\n      --gap-y: var(--space-md);\n    }\n\n    .gap-y-lg\\@xl {\n      --gap-y: var(--space-lg);\n    }\n\n    .gap-y-xl\\@xl {\n      --gap-y: var(--space-xl);\n    }\n\n    .gap-y-xxl\\@xl {\n      --gap-y: var(--space-xxl);\n    }\n\n    .gap-y-xxxl\\@xl {\n      --gap-y: var(--space-xxxl);\n    }\n\n    .gap-y-xxxxl\\@xl {\n      --gap-y: var(--space-xxxxl);\n    }\n\n    .gap-y-0\\@xl {\n      --gap-y: 0px;\n    }\n  }\n}\n:root {\n  --radius-sm: calc(var(--radius, 0.25em)/2);\n  --radius-md: var(--radius, 0.25em);\n  --radius-lg: calc(var(--radius, 0.25em)*2);\n  --shadow-xs: 0 0.1px 0.3px rgba(0, 0, 0, 0.06),\n                0 1px 2px rgba(0, 0, 0, 0.12);\n  --shadow-sm: 0 0.3px 0.4px rgba(0, 0, 0, 0.025),\n                0 0.9px 1.5px rgba(0, 0, 0, 0.05),\n                0 3.5px 6px rgba(0, 0, 0, 0.1);\n  --shadow-md: 0 0.9px 1.5px rgba(0, 0, 0, 0.03),\n                0 3.1px 5.5px rgba(0, 0, 0, 0.08),\n                0 14px 25px rgba(0, 0, 0, 0.12);\n  --shadow-lg: 0 1.2px 1.9px -1px rgba(0, 0, 0, 0.014),\n                0 3.3px 5.3px -1px rgba(0, 0, 0, 0.038),\n                0 8.5px 12.7px -1px rgba(0, 0, 0, 0.085),\n                0 30px 42px -1px rgba(0, 0, 0, 0.15);\n  --shadow-xl: 0 1.5px 2.1px -6px rgba(0, 0, 0, 0.012),\n                0 3.6px 5.2px -6px rgba(0, 0, 0, 0.035),\n                0 7.3px 10.6px -6px rgba(0, 0, 0, 0.07),\n                0 16.2px 21.9px -6px rgba(0, 0, 0, 0.117),\n                0 46px 60px -6px rgba(0, 0, 0, 0.2);\n  --bounce: cubic-bezier(0.175, 0.885, 0.32, 1.275);\n  --ease-in-out: cubic-bezier(0.645, 0.045, 0.355, 1);\n  --ease-in: cubic-bezier(0.55, 0.055, 0.675, 0.19);\n  --ease-out: cubic-bezier(0.215, 0.61, 0.355, 1);\n  --ease-out-back: cubic-bezier(0.34, 1.56, 0.64, 1);\n}\n:root {\n  --heading-line-height: 1.2;\n  --body-line-height: 1.4;\n}\nbody {\n  font-size: var(--text-base-size, 1em);\n  font-family: var(--font-primary, sans-serif);\n  color: var(--color-contrast-high, #313135);\n}\nh1, h2, h3, h4 {\n  color: var(--color-contrast-higher, #1c1c21);\n  line-height: var(--heading-line-height, 1.2);\n}\nh1 {\n  font-size: var(--text-xxl, 2.074em);\n}\nh2 {\n  font-size: var(--text-xl, 1.728em);\n}\nh3 {\n  font-size: var(--text-lg, 1.44em);\n}\nh4 {\n  font-size: var(--text-md, 1.2em);\n}\nsmall {\n  font-size: var(--text-sm, 0.833em);\n}\na, .link {\n  color: var(--color-primary, #2a6df4);\n  text-decoration: underline;\n}\nstrong {\n  font-weight: bold;\n}\ns {\n  text-decoration: line-through;\n}\nu {\n  text-decoration: underline;\n}\n.text-component h1, .text-component h2, .text-component h3, .text-component h4 {\n  line-height: calc(var(--heading-line-height) * var(--line-height-multiplier, 1));\n  margin-bottom: calc(var(--space-unit) * 0.25 * var(--text-vspace-multiplier, 1));\n}\n.text-component h2, .text-component h3, .text-component h4 {\n  margin-top: calc(var(--space-unit) * 0.75 * var(--text-vspace-multiplier, 1));\n}\n.text-component p, .text-component blockquote, .text-component ul li, .text-component ol li {\n  line-height: calc(var(--body-line-height) * var(--line-height-multiplier, 1));\n}\n.text-component ul, .text-component ol, .text-component p, .text-component blockquote, .text-component .text-component__block {\n  margin-bottom: calc(var(--space-unit) * 0.75 * var(--text-vspace-multiplier, 1));\n}\n.text-component ul, .text-component ol {\n  list-style-position: inside;\n}\n.text-component ul {\n  list-style-type: disc;\n}\n.text-component ol {\n  list-style-type: decimal;\n}\n.text-component img {\n  display: block;\n  margin: 0 auto;\n}\n.text-component figcaption {\n  text-align: center;\n  margin-top: calc(var(--space-unit) * 0.5);\n}\n.text-component em {\n  font-style: italic;\n}\n.text-component hr {\n  margin-top: calc(var(--space-unit) * var(--text-vspace-multiplier, 1));\n  margin-bottom: calc(var(--space-unit) * var(--text-vspace-multiplier, 1));\n  margin-left: auto;\n  margin-right: auto;\n}\n.text-component > *:first-child {\n  margin-top: 0;\n}\n.text-component > *:last-child {\n  margin-bottom: 0;\n}\n.text-component__block--full-width {\n  width: 100vw;\n  margin-left: calc(50% - 50vw);\n}\n@media (min-width: 48rem) {\n  .text-component__block--left,\n.text-component__block--right {\n    width: 45%;\n  }\n  .text-component__block--left img,\n.text-component__block--right img {\n    width: 100%;\n  }\n\n  .text-component__block--left {\n    float: left;\n    margin-right: calc(var(--space-unit) * 0.75 * var(--text-vspace-multiplier, 1));\n  }\n\n  .text-component__block--right {\n    float: right;\n    margin-left: calc(var(--space-unit) * 0.75 * var(--text-vspace-multiplier, 1));\n  }\n}\n@media (min-width: 90rem) {\n  .text-component__block--outset {\n    width: calc(100% + 10.5 * var(--space-unit));\n  }\n  .text-component__block--outset img {\n    width: 100%;\n  }\n\n  .text-component__block--outset:not(.text-component__block--right) {\n    margin-left: calc(-5.25 * var(--space-unit));\n  }\n\n  .text-component__block--left, .text-component__block--right {\n    width: 50%;\n  }\n\n  .text-component__block--right.text-component__block--outset {\n    margin-right: calc(-5.25 * var(--space-unit));\n  }\n}\n:root {\n  --icon-xxxs: 8px;\n  --icon-xxs: 12px;\n  --icon-xs: 16px;\n  --icon-sm: 24px;\n  --icon-md: 32px;\n  --icon-lg: 48px;\n  --icon-xl: 64px;\n  --icon-xxl: 96px;\n  --icon-xxxl: 128px;\n}\n.icon {\n  display: inline-block;\n  color: inherit;\n  fill: currentColor;\n  height: 1em;\n  width: 1em;\n  line-height: 1;\n  flex-shrink: 0;\n  max-width: initial;\n}\n.icon--xxxs {\n  width: var(--icon-xxxs);\n  height: var(--icon-xxxs);\n}\n.icon--xxs {\n  width: var(--icon-xxs);\n  height: var(--icon-xxs);\n}\n.icon--xs {\n  width: var(--icon-xs);\n  height: var(--icon-xs);\n}\n.icon--sm {\n  width: var(--icon-sm);\n  height: var(--icon-sm);\n}\n.icon--md {\n  width: var(--icon-md);\n  height: var(--icon-md);\n}\n.icon--lg {\n  width: var(--icon-lg);\n  height: var(--icon-lg);\n}\n.icon--xl {\n  width: var(--icon-xl);\n  height: var(--icon-xl);\n}\n.icon--xxl {\n  width: var(--icon-xxl);\n  height: var(--icon-xxl);\n}\n.icon--xxxl {\n  width: var(--icon-xxxl);\n  height: var(--icon-xxxl);\n}\n.icon--is-spinning {\n  animation: icon-spin 1s infinite linear;\n}\n@keyframes icon-spin {\n  0% {\n    transform: rotate(0deg);\n  }\n  100% {\n    transform: rotate(360deg);\n  }\n}\n.icon use {\n  color: inherit;\n  fill: currentColor;\n}\n.btn {\n  position: relative;\n  display: inline-flex;\n  justify-content: center;\n  align-items: center;\n  white-space: nowrap;\n  text-decoration: none;\n  line-height: 1;\n  font-size: var(--btn-font-size, 1em);\n  padding-top: var(--btn-padding-y, 0.5em);\n  padding-bottom: var(--btn-padding-y, 0.5em);\n  padding-left: var(--btn-padding-x, 0.75em);\n  padding-right: var(--btn-padding-x, 0.75em);\n  border-radius: var(--btn-radius, 0.25em);\n}\n.btn--sm {\n  font-size: var(--btn-font-size-sm, 0.8em);\n}\n.btn--md {\n  font-size: var(--btn-font-size-md, 1.2em);\n}\n.btn--lg {\n  font-size: var(--btn-font-size-lg, 1.4em);\n}\n.btn--icon {\n  padding: var(--btn-padding-y, 0.5em);\n}\n.form-control {\n  font-size: var(--form-control-font-size, 1em);\n  padding-top: var(--form-control-padding-y, 0.5em);\n  padding-bottom: var(--form-control-padding-y, 0.5em);\n  padding-left: var(--form-control-padding-x, 0.75em);\n  padding-right: var(--form-control-padding-x, 0.75em);\n  border-radius: var(--form-control-radius, 0.25em);\n}\n.form-legend {\n  color: var(--color-contrast-higher, #1c1c21);\n  line-height: var(--heading-line-height, 1.2);\n  font-size: var(--text-md, 1.2em);\n  margin-bottom: var(--space-xxs);\n}\n.form-label {\n  display: inline-block;\n}\n.form__msg-error, .form-error-msg {\n  color: var(--color-error, #e02447);\n  font-size: var(--text-sm, 0.833em);\n  margin-top: var(--space-xxs);\n  position: absolute;\n  clip: rect(1px, 1px, 1px, 1px);\n}\n.form__msg-error--is-visible, .form-error-msg--is-visible {\n  position: relative;\n  clip: auto;\n}\n.radio-list > *, .checkbox-list > * {\n  position: relative;\n  display: flex;\n  align-items: baseline;\n}\n.radio-list label, .checkbox-list label {\n  line-height: var(--body-line-height);\n}\n.radio-list input, .checkbox-list input {\n  margin-right: var(--space-xxxs);\n  flex-shrink: 0;\n}\n:root {\n  --zindex-header: 3;\n  --zindex-popover: 5;\n  --zindex-fixed-element: 10;\n  --zindex-overlay: 15;\n}\n:root {\n  --display: block;\n}\n.is-visible {\n  display: var(--display) !important;\n}\n.is-hidden {\n  display: none !important;\n}\nhtml:not(.js) .no-js\\:is-hidden {\n  display: none !important;\n}\n@media print {\n  .print\\:is-hidden {\n    display: none !important;\n  }\n}\n.sr-only {\n  position: absolute;\n  clip: rect(1px, 1px, 1px, 1px);\n  clip-path: inset(50%);\n  width: 1px;\n  height: 1px;\n  overflow: hidden;\n  padding: 0;\n  border: 0;\n  white-space: nowrap;\n}\n.flex {\n  display: flex;\n}\n.inline-flex {\n  display: inline-flex;\n}\n.flex-wrap {\n  flex-wrap: wrap;\n}\n.flex-column {\n  flex-direction: column;\n}\n.flex-column-reverse {\n  flex-direction: column-reverse;\n}\n.flex-row {\n  flex-direction: row;\n}\n.flex-row-reverse {\n  flex-direction: row-reverse;\n}\n.flex-center {\n  justify-content: center;\n  align-items: center;\n}\n.flex-grow {\n  flex-grow: 1;\n}\n.flex-grow-0 {\n  flex-grow: 0;\n}\n.flex-shrink {\n  flex-shrink: 1;\n}\n.flex-shrink-0 {\n  flex-shrink: 0;\n}\n.flex-basis-0 {\n  flex-basis: 0;\n}\n.justify-start {\n  justify-content: flex-start;\n}\n.justify-end {\n  justify-content: flex-end;\n}\n.justify-center {\n  justify-content: center;\n}\n.justify-between {\n  justify-content: space-between;\n}\n.items-center {\n  align-items: center;\n}\n.items-start {\n  align-items: flex-start;\n}\n.items-end {\n  align-items: flex-end;\n}\n.items-baseline {\n  align-items: baseline;\n}\n.order-1 {\n  order: 1;\n}\n.order-2 {\n  order: 2;\n}\n.order-3 {\n  order: 3;\n}\n[class*=aspect-ratio] {\n  --aspect-ratio: 16/9;\n  position: relative;\n  height: 0;\n  padding-bottom: calc(100%/(var(--aspect-ratio)));\n}\n[class*=aspect-ratio] > * {\n  position: absolute;\n  top: 0;\n  left: 0;\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n}\n.aspect-ratio-16\\:9 {\n  --aspect-ratio: 16/9;\n}\n.aspect-ratio-4\\:3 {\n  --aspect-ratio: 4/3;\n}\n.aspect-ratio-1\\:1 {\n  --aspect-ratio: 1/1;\n}\n.block {\n  display: block;\n}\n.inline-block {\n  display: inline-block;\n}\n.inline {\n  display: inline;\n}\n.space-unit-rem {\n  --space-unit: 1rem;\n}\n.space-unit-em {\n  --space-unit: 1em;\n}\n.space-unit-px {\n  --space-unit: 16px;\n}\n.margin-xxxxs {\n  margin: var(--space-xxxxs);\n}\n.margin-xxxs {\n  margin: var(--space-xxxs);\n}\n.margin-xxs {\n  margin: var(--space-xxs);\n}\n.margin-xs {\n  margin: var(--space-xs);\n}\n.margin-sm {\n  margin: var(--space-sm);\n}\n.margin-md {\n  margin: var(--space-md);\n}\n.margin-lg {\n  margin: var(--space-lg);\n}\n.margin-xl {\n  margin: var(--space-xl);\n}\n.margin-xxl {\n  margin: var(--space-xxl);\n}\n.margin-xxxl {\n  margin: var(--space-xxxl);\n}\n.margin-xxxxl {\n  margin: var(--space-xxxxl);\n}\n.margin-auto {\n  margin: auto;\n}\n.margin-0 {\n  margin: 0;\n}\n.margin-top-xxxxs {\n  margin-top: var(--space-xxxxs);\n}\n.margin-top-xxxs {\n  margin-top: var(--space-xxxs);\n}\n.margin-top-xxs {\n  margin-top: var(--space-xxs);\n}\n.margin-top-xs {\n  margin-top: var(--space-xs);\n}\n.margin-top-sm {\n  margin-top: var(--space-sm);\n}\n.margin-top-md {\n  margin-top: var(--space-md);\n}\n.margin-top-lg {\n  margin-top: var(--space-lg);\n}\n.margin-top-xl {\n  margin-top: var(--space-xl);\n}\n.margin-top-xxl {\n  margin-top: var(--space-xxl);\n}\n.margin-top-xxxl {\n  margin-top: var(--space-xxxl);\n}\n.margin-top-xxxxl {\n  margin-top: var(--space-xxxxl);\n}\n.margin-top-auto {\n  margin-top: auto;\n}\n.margin-top-0 {\n  margin-top: 0;\n}\n.margin-bottom-xxxxs {\n  margin-bottom: var(--space-xxxxs);\n}\n.margin-bottom-xxxs {\n  margin-bottom: var(--space-xxxs);\n}\n.margin-bottom-xxs {\n  margin-bottom: var(--space-xxs);\n}\n.margin-bottom-xs {\n  margin-bottom: var(--space-xs);\n}\n.margin-bottom-sm {\n  margin-bottom: var(--space-sm);\n}\n.margin-bottom-md {\n  margin-bottom: var(--space-md);\n}\n.margin-bottom-lg {\n  margin-bottom: var(--space-lg);\n}\n.margin-bottom-xl {\n  margin-bottom: var(--space-xl);\n}\n.margin-bottom-xxl {\n  margin-bottom: var(--space-xxl);\n}\n.margin-bottom-xxxl {\n  margin-bottom: var(--space-xxxl);\n}\n.margin-bottom-xxxxl {\n  margin-bottom: var(--space-xxxxl);\n}\n.margin-bottom-auto {\n  margin-bottom: auto;\n}\n.margin-bottom-0 {\n  margin-bottom: 0;\n}\n.margin-right-xxxxs {\n  margin-right: var(--space-xxxxs);\n}\n.margin-right-xxxs {\n  margin-right: var(--space-xxxs);\n}\n.margin-right-xxs {\n  margin-right: var(--space-xxs);\n}\n.margin-right-xs {\n  margin-right: var(--space-xs);\n}\n.margin-right-sm {\n  margin-right: var(--space-sm);\n}\n.margin-right-md {\n  margin-right: var(--space-md);\n}\n.margin-right-lg {\n  margin-right: var(--space-lg);\n}\n.margin-right-xl {\n  margin-right: var(--space-xl);\n}\n.margin-right-xxl {\n  margin-right: var(--space-xxl);\n}\n.margin-right-xxxl {\n  margin-right: var(--space-xxxl);\n}\n.margin-right-xxxxl {\n  margin-right: var(--space-xxxxl);\n}\n.margin-right-auto {\n  margin-right: auto;\n}\n.margin-right-0 {\n  margin-right: 0;\n}\n.margin-left-xxxxs {\n  margin-left: var(--space-xxxxs);\n}\n.margin-left-xxxs {\n  margin-left: var(--space-xxxs);\n}\n.margin-left-xxs {\n  margin-left: var(--space-xxs);\n}\n.margin-left-xs {\n  margin-left: var(--space-xs);\n}\n.margin-left-sm {\n  margin-left: var(--space-sm);\n}\n.margin-left-md {\n  margin-left: var(--space-md);\n}\n.margin-left-lg {\n  margin-left: var(--space-lg);\n}\n.margin-left-xl {\n  margin-left: var(--space-xl);\n}\n.margin-left-xxl {\n  margin-left: var(--space-xxl);\n}\n.margin-left-xxxl {\n  margin-left: var(--space-xxxl);\n}\n.margin-left-xxxxl {\n  margin-left: var(--space-xxxxl);\n}\n.margin-left-auto {\n  margin-left: auto;\n}\n.margin-left-0 {\n  margin-left: 0;\n}\n.margin-x-xxxxs {\n  margin-left: var(--space-xxxxs);\n  margin-right: var(--space-xxxxs);\n}\n.margin-x-xxxs {\n  margin-left: var(--space-xxxs);\n  margin-right: var(--space-xxxs);\n}\n.margin-x-xxs {\n  margin-left: var(--space-xxs);\n  margin-right: var(--space-xxs);\n}\n.margin-x-xs {\n  margin-left: var(--space-xs);\n  margin-right: var(--space-xs);\n}\n.margin-x-sm {\n  margin-left: var(--space-sm);\n  margin-right: var(--space-sm);\n}\n.margin-x-md {\n  margin-left: var(--space-md);\n  margin-right: var(--space-md);\n}\n.margin-x-lg {\n  margin-left: var(--space-lg);\n  margin-right: var(--space-lg);\n}\n.margin-x-xl {\n  margin-left: var(--space-xl);\n  margin-right: var(--space-xl);\n}\n.margin-x-xxl {\n  margin-left: var(--space-xxl);\n  margin-right: var(--space-xxl);\n}\n.margin-x-xxxl {\n  margin-left: var(--space-xxxl);\n  margin-right: var(--space-xxxl);\n}\n.margin-x-xxxxl {\n  margin-left: var(--space-xxxxl);\n  margin-right: var(--space-xxxxl);\n}\n.margin-x-auto {\n  margin-left: auto;\n  margin-right: auto;\n}\n.margin-x-0 {\n  margin-left: 0;\n  margin-right: 0;\n}\n.margin-y-xxxxs {\n  margin-top: var(--space-xxxxs);\n  margin-bottom: var(--space-xxxxs);\n}\n.margin-y-xxxs {\n  margin-top: var(--space-xxxs);\n  margin-bottom: var(--space-xxxs);\n}\n.margin-y-xxs {\n  margin-top: var(--space-xxs);\n  margin-bottom: var(--space-xxs);\n}\n.margin-y-xs {\n  margin-top: var(--space-xs);\n  margin-bottom: var(--space-xs);\n}\n.margin-y-sm {\n  margin-top: var(--space-sm);\n  margin-bottom: var(--space-sm);\n}\n.margin-y-md {\n  margin-top: var(--space-md);\n  margin-bottom: var(--space-md);\n}\n.margin-y-lg {\n  margin-top: var(--space-lg);\n  margin-bottom: var(--space-lg);\n}\n.margin-y-xl {\n  margin-top: var(--space-xl);\n  margin-bottom: var(--space-xl);\n}\n.margin-y-xxl {\n  margin-top: var(--space-xxl);\n  margin-bottom: var(--space-xxl);\n}\n.margin-y-xxxl {\n  margin-top: var(--space-xxxl);\n  margin-bottom: var(--space-xxxl);\n}\n.margin-y-xxxxl {\n  margin-top: var(--space-xxxxl);\n  margin-bottom: var(--space-xxxxl);\n}\n.margin-y-auto {\n  margin-top: auto;\n  margin-bottom: auto;\n}\n.margin-y-0 {\n  margin-top: 0;\n  margin-bottom: 0;\n}\n.padding-xxxxs {\n  padding: var(--space-xxxxs);\n}\n.padding-xxxs {\n  padding: var(--space-xxxs);\n}\n.padding-xxs {\n  padding: var(--space-xxs);\n}\n.padding-xs {\n  padding: var(--space-xs);\n}\n.padding-sm {\n  padding: var(--space-sm);\n}\n.padding-md {\n  padding: var(--space-md);\n}\n.padding-lg {\n  padding: var(--space-lg);\n}\n.padding-xl {\n  padding: var(--space-xl);\n}\n.padding-xxl {\n  padding: var(--space-xxl);\n}\n.padding-xxxl {\n  padding: var(--space-xxxl);\n}\n.padding-xxxxl {\n  padding: var(--space-xxxxl);\n}\n.padding-0 {\n  padding: 0;\n}\n.padding-component {\n  padding: var(--component-padding);\n}\n.padding-top-xxxxs {\n  padding-top: var(--space-xxxxs);\n}\n.padding-top-xxxs {\n  padding-top: var(--space-xxxs);\n}\n.padding-top-xxs {\n  padding-top: var(--space-xxs);\n}\n.padding-top-xs {\n  padding-top: var(--space-xs);\n}\n.padding-top-sm {\n  padding-top: var(--space-sm);\n}\n.padding-top-md {\n  padding-top: var(--space-md);\n}\n.padding-top-lg {\n  padding-top: var(--space-lg);\n}\n.padding-top-xl {\n  padding-top: var(--space-xl);\n}\n.padding-top-xxl {\n  padding-top: var(--space-xxl);\n}\n.padding-top-xxxl {\n  padding-top: var(--space-xxxl);\n}\n.padding-top-xxxxl {\n  padding-top: var(--space-xxxxl);\n}\n.padding-top-0 {\n  padding-top: 0;\n}\n.padding-top-component {\n  padding-top: var(--component-padding);\n}\n.padding-bottom-xxxxs {\n  padding-bottom: var(--space-xxxxs);\n}\n.padding-bottom-xxxs {\n  padding-bottom: var(--space-xxxs);\n}\n.padding-bottom-xxs {\n  padding-bottom: var(--space-xxs);\n}\n.padding-bottom-xs {\n  padding-bottom: var(--space-xs);\n}\n.padding-bottom-sm {\n  padding-bottom: var(--space-sm);\n}\n.padding-bottom-md {\n  padding-bottom: var(--space-md);\n}\n.padding-bottom-lg {\n  padding-bottom: var(--space-lg);\n}\n.padding-bottom-xl {\n  padding-bottom: var(--space-xl);\n}\n.padding-bottom-xxl {\n  padding-bottom: var(--space-xxl);\n}\n.padding-bottom-xxxl {\n  padding-bottom: var(--space-xxxl);\n}\n.padding-bottom-xxxxl {\n  padding-bottom: var(--space-xxxxl);\n}\n.padding-bottom-0 {\n  padding-bottom: 0;\n}\n.padding-bottom-component {\n  padding-bottom: var(--component-padding);\n}\n.padding-right-xxxxs {\n  padding-right: var(--space-xxxxs);\n}\n.padding-right-xxxs {\n  padding-right: var(--space-xxxs);\n}\n.padding-right-xxs {\n  padding-right: var(--space-xxs);\n}\n.padding-right-xs {\n  padding-right: var(--space-xs);\n}\n.padding-right-sm {\n  padding-right: var(--space-sm);\n}\n.padding-right-md {\n  padding-right: var(--space-md);\n}\n.padding-right-lg {\n  padding-right: var(--space-lg);\n}\n.padding-right-xl {\n  padding-right: var(--space-xl);\n}\n.padding-right-xxl {\n  padding-right: var(--space-xxl);\n}\n.padding-right-xxxl {\n  padding-right: var(--space-xxxl);\n}\n.padding-right-xxxxl {\n  padding-right: var(--space-xxxxl);\n}\n.padding-right-0 {\n  padding-right: 0;\n}\n.padding-right-component {\n  padding-right: var(--component-padding);\n}\n.padding-left-xxxxs {\n  padding-left: var(--space-xxxxs);\n}\n.padding-left-xxxs {\n  padding-left: var(--space-xxxs);\n}\n.padding-left-xxs {\n  padding-left: var(--space-xxs);\n}\n.padding-left-xs {\n  padding-left: var(--space-xs);\n}\n.padding-left-sm {\n  padding-left: var(--space-sm);\n}\n.padding-left-md {\n  padding-left: var(--space-md);\n}\n.padding-left-lg {\n  padding-left: var(--space-lg);\n}\n.padding-left-xl {\n  padding-left: var(--space-xl);\n}\n.padding-left-xxl {\n  padding-left: var(--space-xxl);\n}\n.padding-left-xxxl {\n  padding-left: var(--space-xxxl);\n}\n.padding-left-xxxxl {\n  padding-left: var(--space-xxxxl);\n}\n.padding-left-0 {\n  padding-left: 0;\n}\n.padding-left-component {\n  padding-left: var(--component-padding);\n}\n.padding-x-xxxxs {\n  padding-left: var(--space-xxxxs);\n  padding-right: var(--space-xxxxs);\n}\n.padding-x-xxxs {\n  padding-left: var(--space-xxxs);\n  padding-right: var(--space-xxxs);\n}\n.padding-x-xxs {\n  padding-left: var(--space-xxs);\n  padding-right: var(--space-xxs);\n}\n.padding-x-xs {\n  padding-left: var(--space-xs);\n  padding-right: var(--space-xs);\n}\n.padding-x-sm {\n  padding-left: var(--space-sm);\n  padding-right: var(--space-sm);\n}\n.padding-x-md {\n  padding-left: var(--space-md);\n  padding-right: var(--space-md);\n}\n.padding-x-lg {\n  padding-left: var(--space-lg);\n  padding-right: var(--space-lg);\n}\n.padding-x-xl {\n  padding-left: var(--space-xl);\n  padding-right: var(--space-xl);\n}\n.padding-x-xxl {\n  padding-left: var(--space-xxl);\n  padding-right: var(--space-xxl);\n}\n.padding-x-xxxl {\n  padding-left: var(--space-xxxl);\n  padding-right: var(--space-xxxl);\n}\n.padding-x-xxxxl {\n  padding-left: var(--space-xxxxl);\n  padding-right: var(--space-xxxxl);\n}\n.padding-x-0 {\n  padding-left: 0;\n  padding-right: 0;\n}\n.padding-x-component {\n  padding-left: var(--component-padding);\n  padding-right: var(--component-padding);\n}\n.padding-y-xxxxs {\n  padding-top: var(--space-xxxxs);\n  padding-bottom: var(--space-xxxxs);\n}\n.padding-y-xxxs {\n  padding-top: var(--space-xxxs);\n  padding-bottom: var(--space-xxxs);\n}\n.padding-y-xxs {\n  padding-top: var(--space-xxs);\n  padding-bottom: var(--space-xxs);\n}\n.padding-y-xs {\n  padding-top: var(--space-xs);\n  padding-bottom: var(--space-xs);\n}\n.padding-y-sm {\n  padding-top: var(--space-sm);\n  padding-bottom: var(--space-sm);\n}\n.padding-y-md {\n  padding-top: var(--space-md);\n  padding-bottom: var(--space-md);\n}\n.padding-y-lg {\n  padding-top: var(--space-lg);\n  padding-bottom: var(--space-lg);\n}\n.padding-y-xl {\n  padding-top: var(--space-xl);\n  padding-bottom: var(--space-xl);\n}\n.padding-y-xxl {\n  padding-top: var(--space-xxl);\n  padding-bottom: var(--space-xxl);\n}\n.padding-y-xxxl {\n  padding-top: var(--space-xxxl);\n  padding-bottom: var(--space-xxxl);\n}\n.padding-y-xxxxl {\n  padding-top: var(--space-xxxxl);\n  padding-bottom: var(--space-xxxxl);\n}\n.padding-y-0 {\n  padding-top: 0;\n  padding-bottom: 0;\n}\n.padding-y-component {\n  padding-top: var(--component-padding);\n  padding-bottom: var(--component-padding);\n}\n.align-baseline {\n  vertical-align: baseline;\n}\n.align-top {\n  vertical-align: top;\n}\n.align-middle {\n  vertical-align: middle;\n}\n.align-bottom {\n  vertical-align: bottom;\n}\n.truncate, .text-truncate {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.text-replace {\n  overflow: hidden;\n  color: transparent;\n  text-indent: 100%;\n  white-space: nowrap;\n}\n.break-word {\n  overflow-wrap: break-word;\n  min-width: 0;\n}\n.text-xs {\n  font-size: var(--text-xs, 0.694em);\n}\n.text-sm {\n  font-size: var(--text-sm, 0.833em);\n}\n.text-base {\n  font-size: var(--text-unit, 1em);\n}\n.text-md {\n  font-size: var(--text-md, 1.2em);\n}\n.text-lg {\n  font-size: var(--text-lg, 1.44em);\n}\n.text-xl {\n  font-size: var(--text-xl, 1.728em);\n}\n.text-xxl {\n  font-size: var(--text-xxl, 2.074em);\n}\n.text-xxxl {\n  font-size: var(--text-xxxl, 2.488em);\n}\n.text-xxxxl {\n  font-size: var(--text-xxxxl, 2.985em);\n}\n.text-unit-rem, .text-unit-em, .text-unit-px {\n  font-size: var(--text-unit);\n}\n.text-unit-rem {\n  --text-unit: 1rem;\n}\n.text-unit-em {\n  --text-unit: 1em;\n}\n.text-unit-px {\n  --text-unit: 16px;\n}\n.text-uppercase {\n  text-transform: uppercase;\n}\n.text-capitalize {\n  text-transform: capitalize;\n}\n.letter-spacing-sm {\n  letter-spacing: -0.05em;\n}\n.letter-spacing-md {\n  letter-spacing: 0.05em;\n}\n.letter-spacing-lg {\n  letter-spacing: 0.1em;\n}\n.font-light {\n  font-weight: 300;\n}\n.font-normal {\n  font-weight: 400;\n}\n.font-medium {\n  font-weight: 500;\n}\n.font-semibold {\n  font-weight: 600;\n}\n.font-bold, .text-bold {\n  font-weight: 700;\n}\n.font-italic {\n  font-style: italic;\n}\n.font-smooth {\n  -webkit-font-smoothing: antialiased;\n  -moz-osx-font-smoothing: grayscale;\n}\n.font-primary {\n  font-family: var(--font-primary);\n}\n.text-center {\n  text-align: center;\n}\n.text-left {\n  text-align: left;\n}\n.text-right {\n  text-align: right;\n}\n.text-justify {\n  text-align: justify;\n}\n.text-line-through {\n  text-decoration: line-through;\n}\n.text-underline {\n  text-decoration: underline;\n}\n.text-decoration-none {\n  text-decoration: none;\n}\n.text-shadow-xs {\n  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.15);\n}\n.text-shadow-sm {\n  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);\n}\n.text-shadow-md {\n  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.2);\n}\n.text-shadow-lg {\n  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.1), 0 2px 8px rgba(0, 0, 0, 0.15), 0 4px 16px rgba(0, 0, 0, 0.2);\n}\n.text-shadow-xl {\n  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.1), 0 2px 8px rgba(0, 0, 0, 0.15), 0 4px 16px rgba(0, 0, 0, 0.2), 0 6px 24px rgba(0, 0, 0, 0.25);\n}\n.text-shadow-none {\n  text-shadow: none;\n}\n.v-space-xxs {\n  --text-vspace-multiplier: 0.25 !important;\n}\n.v-space-xs {\n  --text-vspace-multiplier: 0.5 !important;\n}\n.v-space-sm {\n  --text-vspace-multiplier: 0.75 !important;\n}\n.v-space-md {\n  --text-vspace-multiplier: 1.25 !important;\n}\n.v-space-lg {\n  --text-vspace-multiplier: 1.5 !important;\n}\n.v-space-xl {\n  --text-vspace-multiplier: 1.75 !important;\n}\n.v-space-xxl {\n  --text-vspace-multiplier: 2 !important;\n}\n.line-height-xs {\n  --heading-line-height: 1;\n  --body-line-height: 1.1;\n}\n.line-height-xs:not(.text-component) {\n  line-height: 1.1;\n}\n.line-height-sm {\n  --heading-line-height: 1.1;\n  --body-line-height: 1.2;\n}\n.line-height-sm:not(.text-component) {\n  line-height: 1.2;\n}\n.line-height-md {\n  --heading-line-height: 1.15;\n  --body-line-height: 1.4;\n}\n.line-height-md:not(.text-component) {\n  line-height: 1.4;\n}\n.line-height-lg {\n  --heading-line-height: 1.22;\n  --body-line-height: 1.58;\n}\n.line-height-lg:not(.text-component) {\n  line-height: 1.58;\n}\n.line-height-xl {\n  --heading-line-height: 1.3;\n  --body-line-height: 1.72;\n}\n.line-height-xl:not(.text-component) {\n  line-height: 1.72;\n}\n.line-height-body {\n  line-height: var(--body-line-height);\n}\n.line-height-heading {\n  line-height: var(--heading-line-height);\n}\n.line-height-normal {\n  line-height: normal !important;\n}\n.line-height-1 {\n  line-height: 1 !important;\n}\n.ws-nowrap, .text-nowrap {\n  white-space: nowrap;\n}\n.cursor-pointer {\n  cursor: pointer;\n}\n.cursor-default {\n  cursor: default;\n}\n.pointer-events-auto {\n  pointer-events: auto;\n}\n.pointer-events-none {\n  pointer-events: none;\n}\n.user-select-none {\n  user-select: none;\n}\n.user-select-all {\n  user-select: all;\n}\n[class*=color-] {\n  --color-o: 1;\n}\n.color-inherit {\n  color: inherit;\n}\n.color-bg {\n  color: hsla(var(--color-bg-h), var(--color-bg-s), var(--color-bg-l), var(--color-o, 1));\n}\n.color-contrast-lower {\n  color: hsla(var(--color-contrast-lower-h), var(--color-contrast-lower-s), var(--color-contrast-lower-l), var(--color-o, 1));\n}\n.color-contrast-low {\n  color: hsla(var(--color-contrast-low-h), var(--color-contrast-low-s), var(--color-contrast-low-l), var(--color-o, 1));\n}\n.color-contrast-medium {\n  color: hsla(var(--color-contrast-medium-h), var(--color-contrast-medium-s), var(--color-contrast-medium-l), var(--color-o, 1));\n}\n.color-contrast-high {\n  color: hsla(var(--color-contrast-high-h), var(--color-contrast-high-s), var(--color-contrast-high-l), var(--color-o, 1));\n}\n.color-contrast-higher {\n  color: hsla(var(--color-contrast-higher-h), var(--color-contrast-higher-s), var(--color-contrast-higher-l), var(--color-o, 1));\n}\n.color-primary-darker {\n  color: hsla(var(--color-primary-darker-h), var(--color-primary-darker-s), var(--color-primary-darker-l), var(--color-o, 1));\n}\n.color-primary-dark {\n  color: hsla(var(--color-primary-dark-h), var(--color-primary-dark-s), var(--color-primary-dark-l), var(--color-o, 1));\n}\n.color-primary {\n  color: hsla(var(--color-primary-h), var(--color-primary-s), var(--color-primary-l), var(--color-o, 1));\n}\n.color-primary-light {\n  color: hsla(var(--color-primary-light-h), var(--color-primary-light-s), var(--color-primary-light-l), var(--color-o, 1));\n}\n.color-primary-lighter {\n  color: hsla(var(--color-primary-lighter-h), var(--color-primary-lighter-s), var(--color-primary-lighter-l), var(--color-o, 1));\n}\n.color-accent-darker {\n  color: hsla(var(--color-accent-darker-h), var(--color-accent-darker-s), var(--color-accent-darker-l), var(--color-o, 1));\n}\n.color-accent-dark {\n  color: hsla(var(--color-accent-dark-h), var(--color-accent-dark-s), var(--color-accent-dark-l), var(--color-o, 1));\n}\n.color-accent {\n  color: hsla(var(--color-accent-h), var(--color-accent-s), var(--color-accent-l), var(--color-o, 1));\n}\n.color-accent-light {\n  color: hsla(var(--color-accent-light-h), var(--color-accent-light-s), var(--color-accent-light-l), var(--color-o, 1));\n}\n.color-accent-lighter {\n  color: hsla(var(--color-accent-lighter-h), var(--color-accent-lighter-s), var(--color-accent-lighter-l), var(--color-o, 1));\n}\n.color-success-darker {\n  color: hsla(var(--color-success-darker-h), var(--color-success-darker-s), var(--color-success-darker-l), var(--color-o, 1));\n}\n.color-success-dark {\n  color: hsla(var(--color-success-dark-h), var(--color-success-dark-s), var(--color-success-dark-l), var(--color-o, 1));\n}\n.color-success {\n  color: hsla(var(--color-success-h), var(--color-success-s), var(--color-success-l), var(--color-o, 1));\n}\n.color-success-light {\n  color: hsla(var(--color-success-light-h), var(--color-success-light-s), var(--color-success-light-l), var(--color-o, 1));\n}\n.color-success-lighter {\n  color: hsla(var(--color-success-lighter-h), var(--color-success-lighter-s), var(--color-success-lighter-l), var(--color-o, 1));\n}\n.color-warning-darker {\n  color: hsla(var(--color-warning-darker-h), var(--color-warning-darker-s), var(--color-warning-darker-l), var(--color-o, 1));\n}\n.color-warning-dark {\n  color: hsla(var(--color-warning-dark-h), var(--color-warning-dark-s), var(--color-warning-dark-l), var(--color-o, 1));\n}\n.color-warning {\n  color: hsla(var(--color-warning-h), var(--color-warning-s), var(--color-warning-l), var(--color-o, 1));\n}\n.color-warning-light {\n  color: hsla(var(--color-warning-light-h), var(--color-warning-light-s), var(--color-warning-light-l), var(--color-o, 1));\n}\n.color-warning-lighter {\n  color: hsla(var(--color-warning-lighter-h), var(--color-warning-lighter-s), var(--color-warning-lighter-l), var(--color-o, 1));\n}\n.color-error-darker {\n  color: hsla(var(--color-error-darker-h), var(--color-error-darker-s), var(--color-error-darker-l), var(--color-o, 1));\n}\n.color-error-dark {\n  color: hsla(var(--color-error-dark-h), var(--color-error-dark-s), var(--color-error-dark-l), var(--color-o, 1));\n}\n.color-error {\n  color: hsla(var(--color-error-h), var(--color-error-s), var(--color-error-l), var(--color-o, 1));\n}\n.color-error-light {\n  color: hsla(var(--color-error-light-h), var(--color-error-light-s), var(--color-error-light-l), var(--color-o, 1));\n}\n.color-error-lighter {\n  color: hsla(var(--color-error-lighter-h), var(--color-error-lighter-s), var(--color-error-lighter-l), var(--color-o, 1));\n}\n.color-white {\n  color: hsla(var(--color-white-h), var(--color-white-s), var(--color-white-l), var(--color-o, 1));\n}\n.color-black {\n  color: hsla(var(--color-black-h), var(--color-black-s), var(--color-black-l), var(--color-o, 1));\n}\n@supports (--css: variables) {\n  .color-opacity-0 {\n    --color-o: 0;\n  }\n\n  .color-opacity-10\\% {\n    --color-o: 0.1;\n  }\n\n  .color-opacity-20\\% {\n    --color-o: 0.2;\n  }\n\n  .color-opacity-30\\% {\n    --color-o: 0.3;\n  }\n\n  .color-opacity-40\\% {\n    --color-o: 0.4;\n  }\n\n  .color-opacity-50\\% {\n    --color-o: 0.5;\n  }\n\n  .color-opacity-60\\% {\n    --color-o: 0.6;\n  }\n\n  .color-opacity-70\\% {\n    --color-o: 0.7;\n  }\n\n  .color-opacity-80\\% {\n    --color-o: 0.8;\n  }\n\n  .color-opacity-90\\% {\n    --color-o: 0.9;\n  }\n}\n@supports (--css: variables) {\n  [class*=color-gradient-] {\n    color: transparent !important;\n    background-clip: text;\n  }\n}\n.width-xxxxs {\n  width: var(--size-xxxxs, 0.25rem);\n}\n.width-xxxs {\n  width: var(--size-xxxs, 0.5rem);\n}\n.width-xxs {\n  width: var(--size-xxs, 0.75rem);\n}\n.width-xs {\n  width: var(--size-xs, 1rem);\n}\n.width-sm {\n  width: var(--size-sm, 1.5rem);\n}\n.width-md {\n  width: var(--size-md, 2rem);\n}\n.width-lg {\n  width: var(--size-lg, 3rem);\n}\n.width-xl {\n  width: var(--size-xl, 4rem);\n}\n.width-xxl {\n  width: var(--size-xxl, 6rem);\n}\n.width-xxxl {\n  width: var(--size-xxxl, 8rem);\n}\n.width-xxxxl {\n  width: var(--size-xxxxl, 16rem);\n}\n.width-0 {\n  width: 0;\n}\n.width-10\\% {\n  width: 10%;\n}\n.width-20\\% {\n  width: 20%;\n}\n.width-25\\% {\n  width: 25%;\n}\n.width-30\\% {\n  width: 30%;\n}\n.width-33\\% {\n  width: calc(100% / 3);\n}\n.width-40\\% {\n  width: 40%;\n}\n.width-50\\% {\n  width: 50%;\n}\n.width-60\\% {\n  width: 60%;\n}\n.width-66\\% {\n  width: calc(100% / 1.5);\n}\n.width-70\\% {\n  width: 70%;\n}\n.width-75\\% {\n  width: 75%;\n}\n.width-80\\% {\n  width: 80%;\n}\n.width-90\\% {\n  width: 90%;\n}\n.width-100\\% {\n  width: 100%;\n}\n.width-100vw {\n  width: 100vw;\n}\n.width-auto {\n  width: auto;\n}\n.height-xxxxs {\n  height: var(--size-xxxxs, 0.25rem);\n}\n.height-xxxs {\n  height: var(--size-xxxs, 0.5rem);\n}\n.height-xxs {\n  height: var(--size-xxs, 0.75rem);\n}\n.height-xs {\n  height: var(--size-xs, 1rem);\n}\n.height-sm {\n  height: var(--size-sm, 1.5rem);\n}\n.height-md {\n  height: var(--size-md, 2rem);\n}\n.height-lg {\n  height: var(--size-lg, 3rem);\n}\n.height-xl {\n  height: var(--size-xl, 4rem);\n}\n.height-xxl {\n  height: var(--size-xxl, 6rem);\n}\n.height-xxxl {\n  height: var(--size-xxxl, 8rem);\n}\n.height-xxxxl {\n  height: var(--size-xxxxl, 16rem);\n}\n.height-0 {\n  height: 0;\n}\n.height-10\\% {\n  height: 10%;\n}\n.height-20\\% {\n  height: 20%;\n}\n.height-25\\% {\n  height: 25%;\n}\n.height-30\\% {\n  height: 30%;\n}\n.height-33\\% {\n  height: calc(100% / 3);\n}\n.height-40\\% {\n  height: 40%;\n}\n.height-50\\% {\n  height: 50%;\n}\n.height-60\\% {\n  height: 60%;\n}\n.height-66\\% {\n  height: calc(100% / 1.5);\n}\n.height-70\\% {\n  height: 70%;\n}\n.height-75\\% {\n  height: 75%;\n}\n.height-80\\% {\n  height: 80%;\n}\n.height-90\\% {\n  height: 90%;\n}\n.height-100\\% {\n  height: 100%;\n}\n.height-100vh {\n  height: 100vh;\n}\n.height-auto {\n  height: auto;\n}\n.min-width-0 {\n  min-width: 0;\n}\n.min-width-25\\% {\n  min-width: 25%;\n}\n.min-width-33\\% {\n  min-width: calc(100% / 3);\n}\n.min-width-50\\% {\n  min-width: 50%;\n}\n.min-width-66\\% {\n  min-width: calc(100% / 1.5);\n}\n.min-width-75\\% {\n  min-width: 75%;\n}\n.min-width-100\\% {\n  min-width: 100%;\n}\n.min-width-100vw {\n  min-width: 100vw;\n}\n.min-height-100\\% {\n  min-height: 100%;\n}\n.min-height-100vh {\n  min-height: 100vh;\n}\n:root {\n  --max-width-xxxxs: 20rem;\n  --max-width-xxxs: 26rem;\n  --max-width-xxs: 32rem;\n  --max-width-xs: 38rem;\n  --max-width-sm: 48rem;\n  --max-width-md: 64rem;\n  --max-width-lg: 80rem;\n  --max-width-xl: 90rem;\n  --max-width-xxl: 100rem;\n  --max-width-xxxl: 120rem;\n  --max-width-xxxxl: 150rem;\n}\n.max-width-xxxxs {\n  max-width: var(--max-width-xxxxs);\n}\n.max-width-xxxs {\n  max-width: var(--max-width-xxxs);\n}\n.max-width-xxs {\n  max-width: var(--max-width-xxs);\n}\n.max-width-xs {\n  max-width: var(--max-width-xs);\n}\n.max-width-sm {\n  max-width: var(--max-width-sm);\n}\n.max-width-md {\n  max-width: var(--max-width-md);\n}\n.max-width-lg {\n  max-width: var(--max-width-lg);\n}\n.max-width-xl {\n  max-width: var(--max-width-xl);\n}\n.max-width-xxl {\n  max-width: var(--max-width-xxl);\n}\n.max-width-xxxl {\n  max-width: var(--max-width-xxxl);\n}\n.max-width-xxxxl {\n  max-width: var(--max-width-xxxxl);\n}\n.max-width-100\\% {\n  max-width: 100%;\n}\n[class*=max-width-adaptive] {\n  max-width: 32rem;\n}\n@media (min-width: 48rem) {\n  .max-width-adaptive-sm, .max-width-adaptive-md, .max-width-adaptive-lg, .max-width-adaptive-xl, .max-width-adaptive {\n    max-width: 48rem;\n  }\n}\n@media (min-width: 64rem) {\n  .max-width-adaptive-md, .max-width-adaptive-lg, .max-width-adaptive-xl, .max-width-adaptive {\n    max-width: 64rem;\n  }\n}\n@media (min-width: 80rem) {\n  .max-width-adaptive-lg, .max-width-adaptive-xl, .max-width-adaptive {\n    max-width: 80rem;\n  }\n}\n@media (min-width: 90rem) {\n  .max-width-adaptive-xl {\n    max-width: 90rem;\n  }\n}\n.max-height-100\\% {\n  max-height: 100%;\n}\n.max-height-100vh {\n  max-height: 100vh;\n}\n.position-relative {\n  position: relative;\n}\n.position-absolute {\n  position: absolute;\n}\n.position-fixed {\n  position: fixed;\n}\n.position-sticky {\n  position: sticky;\n}\n.top-0 {\n  top: 0;\n}\n.top-50\\% {\n  top: 50%;\n}\n.bottom-0 {\n  bottom: 0;\n}\n.bottom-50\\% {\n  bottom: 50%;\n}\n.left-0 {\n  left: 0;\n}\n.left-50\\% {\n  left: 50%;\n}\n.right-0 {\n  right: 0;\n}\n.right-50\\% {\n  right: 50%;\n}\n.inset-0 {\n  top: 0;\n  right: 0;\n  bottom: 0;\n  left: 0;\n}\n.z-index-header {\n  z-index: var(--zindex-header);\n}\n.z-index-popover {\n  z-index: var(--zindex-popover);\n}\n.z-index-fixed-element {\n  z-index: var(--zindex-fixed-element);\n}\n.z-index-overlay {\n  z-index: var(--zindex-overlay);\n}\n.zindex-1, .z-index-1 {\n  z-index: 1;\n}\n.zindex-2, .z-index-2 {\n  z-index: 2;\n}\n.zindex-3, .z-index-3 {\n  z-index: 3;\n}\n.overflow-hidden {\n  overflow: hidden;\n}\n.overflow-auto {\n  overflow: auto;\n}\n.momentum-scrolling {\n  -webkit-overflow-scrolling: touch;\n}\n.overscroll-contain {\n  overscroll-behavior: contain;\n}\n.opacity-0 {\n  opacity: 0;\n}\n.opacity-10\\% {\n  opacity: 0.1;\n}\n.opacity-20\\% {\n  opacity: 0.2;\n}\n.opacity-30\\% {\n  opacity: 0.3;\n}\n.opacity-40\\% {\n  opacity: 0.4;\n}\n.opacity-50\\% {\n  opacity: 0.5;\n}\n.opacity-60\\% {\n  opacity: 0.6;\n}\n.opacity-70\\% {\n  opacity: 0.7;\n}\n.opacity-80\\% {\n  opacity: 0.8;\n}\n.opacity-90\\% {\n  opacity: 0.9;\n}\n.media-wrapper {\n  position: relative;\n  height: 0;\n  padding-bottom: 56.25%;\n}\n.media-wrapper > * {\n  position: absolute;\n  top: 0;\n  left: 0;\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n}\n.media-wrapper--4\\:3 {\n  padding-bottom: calc((3 / 4) * 100%);\n}\n.media-wrapper--1\\:1 {\n  padding-bottom: calc((1 / 1) * 100%);\n}\n.float-left {\n  float: left;\n}\n.float-right {\n  float: right;\n}\n.clearfix::after {\n  content: "";\n  display: table;\n  clear: both;\n}\n[class*=border-] {\n  --border-o: 1;\n}\n.border {\n  border: 1px solid hsla(var(--color-contrast-low-h), var(--color-contrast-low-s), var(--color-contrast-low-l), var(--border-o, 1));\n}\n.border-top {\n  border-top: 1px solid hsla(var(--color-contrast-low-h), var(--color-contrast-low-s), var(--color-contrast-low-l), var(--border-o, 1));\n}\n.border-bottom {\n  border-bottom: 1px solid hsla(var(--color-contrast-low-h), var(--color-contrast-low-s), var(--color-contrast-low-l), var(--border-o, 1));\n}\n.border-left {\n  border-left: 1px solid hsla(var(--color-contrast-low-h), var(--color-contrast-low-s), var(--color-contrast-low-l), var(--border-o, 1));\n}\n.border-right {\n  border-right: 1px solid hsla(var(--color-contrast-low-h), var(--color-contrast-low-s), var(--color-contrast-low-l), var(--border-o, 1));\n}\n.border-2 {\n  border-width: 2px;\n}\n.border-3 {\n  border-width: 3px;\n}\n.border-4 {\n  border-width: 4px;\n}\n.border-bg {\n  border-color: hsla(var(--color-bg-h), var(--color-bg-s), var(--color-bg-l), var(--border-o, 1));\n}\n.border-contrast-lower {\n  border-color: hsla(var(--color-contrast-lower-h), var(--color-contrast-lower-s), var(--color-contrast-lower-l), var(--border-o, 1));\n}\n.border-contrast-low {\n  border-color: hsla(var(--color-contrast-low-h), var(--color-contrast-low-s), var(--color-contrast-low-l), var(--border-o, 1));\n}\n.border-contrast-medium {\n  border-color: hsla(var(--color-contrast-medium-h), var(--color-contrast-medium-s), var(--color-contrast-medium-l), var(--border-o, 1));\n}\n.border-contrast-high {\n  border-color: hsla(var(--color-contrast-high-h), var(--color-contrast-high-s), var(--color-contrast-high-l), var(--border-o, 1));\n}\n.border-contrast-higher {\n  border-color: hsla(var(--color-contrast-higher-h), var(--color-contrast-higher-s), var(--color-contrast-higher-l), var(--border-o, 1));\n}\n.border-primary-darker {\n  border-color: hsla(var(--color-primary-darker-h), var(--color-primary-darker-s), var(--color-primary-darker-l), var(--border-o, 1));\n}\n.border-primary-dark {\n  border-color: hsla(var(--color-primary-dark-h), var(--color-primary-dark-s), var(--color-primary-dark-l), var(--border-o, 1));\n}\n.border-primary {\n  border-color: hsla(var(--color-primary-h), var(--color-primary-s), var(--color-primary-l), var(--border-o, 1));\n}\n.border-primary-light {\n  border-color: hsla(var(--color-primary-light-h), var(--color-primary-light-s), var(--color-primary-light-l), var(--border-o, 1));\n}\n.border-primary-lighter {\n  border-color: hsla(var(--color-primary-lighter-h), var(--color-primary-lighter-s), var(--color-primary-lighter-l), var(--border-o, 1));\n}\n.border-accent-darker {\n  border-color: hsla(var(--color-accent-darker-h), var(--color-accent-darker-s), var(--color-accent-darker-l), var(--border-o, 1));\n}\n.border-accent-dark {\n  border-color: hsla(var(--color-accent-dark-h), var(--color-accent-dark-s), var(--color-accent-dark-l), var(--border-o, 1));\n}\n.border-accent {\n  border-color: hsla(var(--color-accent-h), var(--color-accent-s), var(--color-accent-l), var(--border-o, 1));\n}\n.border-accent-light {\n  border-color: hsla(var(--color-accent-light-h), var(--color-accent-light-s), var(--color-accent-light-l), var(--border-o, 1));\n}\n.border-accent-lighter {\n  border-color: hsla(var(--color-accent-lighter-h), var(--color-accent-lighter-s), var(--color-accent-lighter-l), var(--border-o, 1));\n}\n.border-success-darker {\n  border-color: hsla(var(--color-success-darker-h), var(--color-success-darker-s), var(--color-success-darker-l), var(--border-o, 1));\n}\n.border-success-dark {\n  border-color: hsla(var(--color-success-dark-h), var(--color-success-dark-s), var(--color-success-dark-l), var(--border-o, 1));\n}\n.border-success {\n  border-color: hsla(var(--color-success-h), var(--color-success-s), var(--color-success-l), var(--border-o, 1));\n}\n.border-success-light {\n  border-color: hsla(var(--color-success-light-h), var(--color-success-light-s), var(--color-success-light-l), var(--border-o, 1));\n}\n.border-success-lighter {\n  border-color: hsla(var(--color-success-lighter-h), var(--color-success-lighter-s), var(--color-success-lighter-l), var(--border-o, 1));\n}\n.border-warning-darker {\n  border-color: hsla(var(--color-warning-darker-h), var(--color-warning-darker-s), var(--color-warning-darker-l), var(--border-o, 1));\n}\n.border-warning-dark {\n  border-color: hsla(var(--color-warning-dark-h), var(--color-warning-dark-s), var(--color-warning-dark-l), var(--border-o, 1));\n}\n.border-warning {\n  border-color: hsla(var(--color-warning-h), var(--color-warning-s), var(--color-warning-l), var(--border-o, 1));\n}\n.border-warning-light {\n  border-color: hsla(var(--color-warning-light-h), var(--color-warning-light-s), var(--color-warning-light-l), var(--border-o, 1));\n}\n.border-warning-lighter {\n  border-color: hsla(var(--color-warning-lighter-h), var(--color-warning-lighter-s), var(--color-warning-lighter-l), var(--border-o, 1));\n}\n.border-error-darker {\n  border-color: hsla(var(--color-error-darker-h), var(--color-error-darker-s), var(--color-error-darker-l), var(--border-o, 1));\n}\n.border-error-dark {\n  border-color: hsla(var(--color-error-dark-h), var(--color-error-dark-s), var(--color-error-dark-l), var(--border-o, 1));\n}\n.border-error {\n  border-color: hsla(var(--color-error-h), var(--color-error-s), var(--color-error-l), var(--border-o, 1));\n}\n.border-error-light {\n  border-color: hsla(var(--color-error-light-h), var(--color-error-light-s), var(--color-error-light-l), var(--border-o, 1));\n}\n.border-error-lighter {\n  border-color: hsla(var(--color-error-lighter-h), var(--color-error-lighter-s), var(--color-error-lighter-l), var(--border-o, 1));\n}\n.border-white {\n  border-color: hsla(var(--color-white-h), var(--color-white-s), var(--color-white-l), var(--border-o, 1));\n}\n.border-black {\n  border-color: hsla(var(--color-black-h), var(--color-black-s), var(--color-black-l), var(--border-o, 1));\n}\n@supports (--css: variables) {\n  .border-opacity-0 {\n    --border-o: 0;\n  }\n\n  .border-opacity-10\\% {\n    --border-o: 0.1;\n  }\n\n  .border-opacity-20\\% {\n    --border-o: 0.2;\n  }\n\n  .border-opacity-30\\% {\n    --border-o: 0.3;\n  }\n\n  .border-opacity-40\\% {\n    --border-o: 0.4;\n  }\n\n  .border-opacity-50\\% {\n    --border-o: 0.5;\n  }\n\n  .border-opacity-60\\% {\n    --border-o: 0.6;\n  }\n\n  .border-opacity-70\\% {\n    --border-o: 0.7;\n  }\n\n  .border-opacity-80\\% {\n    --border-o: 0.8;\n  }\n\n  .border-opacity-90\\% {\n    --border-o: 0.9;\n  }\n}\n.radius-sm {\n  border-radius: var(--radius-sm);\n}\n.radius-md {\n  border-radius: var(--radius-md);\n}\n.radius-lg {\n  border-radius: var(--radius-lg);\n}\n.radius-50\\% {\n  border-radius: 50%;\n}\n.radius-full {\n  border-radius: 50em;\n}\n.radius-0 {\n  border-radius: 0;\n}\n.radius-top-left-0 {\n  border-top-left-radius: 0;\n}\n.radius-top-right-0 {\n  border-top-right-radius: 0;\n}\n.radius-bottom-right-0 {\n  border-bottom-right-radius: 0;\n}\n.radius-bottom-left-0 {\n  border-bottom-left-radius: 0;\n}\n.shadow-xs {\n  box-shadow: var(--shadow-xs);\n}\n.shadow-sm {\n  box-shadow: var(--shadow-sm);\n}\n.shadow-md {\n  box-shadow: var(--shadow-md);\n}\n.shadow-lg {\n  box-shadow: var(--shadow-lg);\n}\n.shadow-xl {\n  box-shadow: var(--shadow-xl);\n}\n.shadow-none {\n  box-shadow: none;\n}\n.bg, [class*=bg-] {\n  --bg-o: 1;\n}\n.bg-transparent {\n  background-color: transparent;\n}\n.bg-inherit {\n  background-color: inherit;\n}\n.bg {\n  background-color: hsla(var(--color-bg-h), var(--color-bg-s), var(--color-bg-l), var(--bg-o));\n}\n.bg-contrast-lower {\n  background-color: hsla(var(--color-contrast-lower-h), var(--color-contrast-lower-s), var(--color-contrast-lower-l), var(--bg-o, 1));\n}\n.bg-contrast-low {\n  background-color: hsla(var(--color-contrast-low-h), var(--color-contrast-low-s), var(--color-contrast-low-l), var(--bg-o, 1));\n}\n.bg-contrast-medium {\n  background-color: hsla(var(--color-contrast-medium-h), var(--color-contrast-medium-s), var(--color-contrast-medium-l), var(--bg-o, 1));\n}\n.bg-contrast-high {\n  background-color: hsla(var(--color-contrast-high-h), var(--color-contrast-high-s), var(--color-contrast-high-l), var(--bg-o, 1));\n}\n.bg-contrast-higher {\n  background-color: hsla(var(--color-contrast-higher-h), var(--color-contrast-higher-s), var(--color-contrast-higher-l), var(--bg-o, 1));\n}\n.bg-primary-darker {\n  background-color: hsla(var(--color-primary-darker-h), var(--color-primary-darker-s), var(--color-primary-darker-l), var(--bg-o, 1));\n}\n.bg-primary-dark {\n  background-color: hsla(var(--color-primary-dark-h), var(--color-primary-dark-s), var(--color-primary-dark-l), var(--bg-o, 1));\n}\n.bg-primary {\n  background-color: hsla(var(--color-primary-h), var(--color-primary-s), var(--color-primary-l), var(--bg-o, 1));\n}\n.bg-primary-light {\n  background-color: hsla(var(--color-primary-light-h), var(--color-primary-light-s), var(--color-primary-light-l), var(--bg-o, 1));\n}\n.bg-primary-lighter {\n  background-color: hsla(var(--color-primary-lighter-h), var(--color-primary-lighter-s), var(--color-primary-lighter-l), var(--bg-o, 1));\n}\n.bg-accent-darker {\n  background-color: hsla(var(--color-accent-darker-h), var(--color-accent-darker-s), var(--color-accent-darker-l), var(--bg-o, 1));\n}\n.bg-accent-dark {\n  background-color: hsla(var(--color-accent-dark-h), var(--color-accent-dark-s), var(--color-accent-dark-l), var(--bg-o, 1));\n}\n.bg-accent {\n  background-color: hsla(var(--color-accent-h), var(--color-accent-s), var(--color-accent-l), var(--bg-o, 1));\n}\n.bg-accent-light {\n  background-color: hsla(var(--color-accent-light-h), var(--color-accent-light-s), var(--color-accent-light-l), var(--bg-o, 1));\n}\n.bg-accent-lighter {\n  background-color: hsla(var(--color-accent-lighter-h), var(--color-accent-lighter-s), var(--color-accent-lighter-l), var(--bg-o, 1));\n}\n.bg-success-darker {\n  background-color: hsla(var(--color-success-darker-h), var(--color-success-darker-s), var(--color-success-darker-l), var(--bg-o, 1));\n}\n.bg-success-dark {\n  background-color: hsla(var(--color-success-dark-h), var(--color-success-dark-s), var(--color-success-dark-l), var(--bg-o, 1));\n}\n.bg-success {\n  background-color: hsla(var(--color-success-h), var(--color-success-s), var(--color-success-l), var(--bg-o, 1));\n}\n.bg-success-light {\n  background-color: hsla(var(--color-success-light-h), var(--color-success-light-s), var(--color-success-light-l), var(--bg-o, 1));\n}\n.bg-success-lighter {\n  background-color: hsla(var(--color-success-lighter-h), var(--color-success-lighter-s), var(--color-success-lighter-l), var(--bg-o, 1));\n}\n.bg-warning-darker {\n  background-color: hsla(var(--color-warning-darker-h), var(--color-warning-darker-s), var(--color-warning-darker-l), var(--bg-o, 1));\n}\n.bg-warning-dark {\n  background-color: hsla(var(--color-warning-dark-h), var(--color-warning-dark-s), var(--color-warning-dark-l), var(--bg-o, 1));\n}\n.bg-warning {\n  background-color: hsla(var(--color-warning-h), var(--color-warning-s), var(--color-warning-l), var(--bg-o, 1));\n}\n.bg-warning-light {\n  background-color: hsla(var(--color-warning-light-h), var(--color-warning-light-s), var(--color-warning-light-l), var(--bg-o, 1));\n}\n.bg-warning-lighter {\n  background-color: hsla(var(--color-warning-lighter-h), var(--color-warning-lighter-s), var(--color-warning-lighter-l), var(--bg-o, 1));\n}\n.bg-error-darker {\n  background-color: hsla(var(--color-error-darker-h), var(--color-error-darker-s), var(--color-error-darker-l), var(--bg-o, 1));\n}\n.bg-error-dark {\n  background-color: hsla(var(--color-error-dark-h), var(--color-error-dark-s), var(--color-error-dark-l), var(--bg-o, 1));\n}\n.bg-error {\n  background-color: hsla(var(--color-error-h), var(--color-error-s), var(--color-error-l), var(--bg-o, 1));\n}\n.bg-error-light {\n  background-color: hsla(var(--color-error-light-h), var(--color-error-light-s), var(--color-error-light-l), var(--bg-o, 1));\n}\n.bg-error-lighter {\n  background-color: hsla(var(--color-error-lighter-h), var(--color-error-lighter-s), var(--color-error-lighter-l), var(--bg-o, 1));\n}\n.bg-white {\n  background-color: hsla(var(--color-white-h), var(--color-white-s), var(--color-white-l), var(--bg-o, 1));\n}\n.bg-black {\n  background-color: hsla(var(--color-black-h), var(--color-black-s), var(--color-black-l), var(--bg-o, 1));\n}\n@supports (--css: variables) {\n  .bg-opacity-0 {\n    --bg-o: 0;\n  }\n\n  .bg-opacity-10\\% {\n    --bg-o: 0.1;\n  }\n\n  .bg-opacity-20\\% {\n    --bg-o: 0.2;\n  }\n\n  .bg-opacity-30\\% {\n    --bg-o: 0.3;\n  }\n\n  .bg-opacity-40\\% {\n    --bg-o: 0.4;\n  }\n\n  .bg-opacity-50\\% {\n    --bg-o: 0.5;\n  }\n\n  .bg-opacity-60\\% {\n    --bg-o: 0.6;\n  }\n\n  .bg-opacity-70\\% {\n    --bg-o: 0.7;\n  }\n\n  .bg-opacity-80\\% {\n    --bg-o: 0.8;\n  }\n\n  .bg-opacity-90\\% {\n    --bg-o: 0.9;\n  }\n}\n.bg-cover {\n  background-size: cover;\n}\n.bg-center {\n  background-position: center;\n}\n.bg-no-repeat {\n  background-repeat: no-repeat;\n}\n.backdrop-blur-10 {\n  backdrop-filter: blur(10px);\n}\n.backdrop-blur-20 {\n  backdrop-filter: blur(20px);\n}\n.isolate {\n  isolation: isolate;\n}\n.blend-multiply {\n  mix-blend-mode: multiply;\n}\n.blend-overlay {\n  mix-blend-mode: overlay;\n}\n.blend-difference {\n  mix-blend-mode: difference;\n}\n.object-contain {\n  object-fit: contain;\n}\n.object-cover {\n  object-fit: cover;\n}\n.perspective-xs {\n  perspective: 250px;\n}\n.perspective-sm {\n  perspective: 500px;\n}\n.perspective-md {\n  perspective: 1000px;\n}\n.perspective-lg {\n  perspective: 1500px;\n}\n.perspective-xl {\n  perspective: 3000px;\n}\n.flip {\n  transform: scale(-1);\n}\n.flip-x {\n  transform: scaleX(-1);\n}\n.flip-y {\n  transform: scaleY(-1);\n}\n.-translate-50\\% {\n  transform: translate(-50%, -50%);\n}\n.-translate-x-50\\% {\n  transform: translateX(-50%);\n}\n.-translate-y-50\\% {\n  transform: translateY(-50%);\n}\n.translate-50\\% {\n  transform: translate(50%, 50%);\n}\n.translate-x-50\\% {\n  transform: translateX(50%);\n}\n.translate-y-50\\% {\n  transform: translateY(50%);\n}\n.origin-center {\n  transform-origin: center;\n}\n.origin-top {\n  transform-origin: center top;\n}\n.origin-right {\n  transform-origin: right center;\n}\n.origin-bottom {\n  transform-origin: center bottom;\n}\n.origin-left {\n  transform-origin: left center;\n}\n.origin-top-left {\n  transform-origin: left top;\n}\n.origin-top-right {\n  transform-origin: right top;\n}\n.origin-bottom-left {\n  transform-origin: left bottom;\n}\n.origin-bottom-right {\n  transform-origin: right bottom;\n}\n@media (min-width: 32rem) {\n  .flex\\@xs {\n    display: flex;\n  }\n\n  .inline-flex\\@xs {\n    display: inline-flex;\n  }\n\n  .flex-wrap\\@xs {\n    flex-wrap: wrap;\n  }\n\n  .flex-column\\@xs {\n    flex-direction: column;\n  }\n\n  .flex-column-reverse\\@xs {\n    flex-direction: column-reverse;\n  }\n\n  .flex-row\\@xs {\n    flex-direction: row;\n  }\n\n  .flex-row-reverse\\@xs {\n    flex-direction: row-reverse;\n  }\n\n  .flex-center\\@xs {\n    justify-content: center;\n    align-items: center;\n  }\n\n  .flex-grow\\@xs {\n    flex-grow: 1;\n  }\n\n  .flex-grow-0\\@xs {\n    flex-grow: 0;\n  }\n\n  .flex-shrink\\@xs {\n    flex-shrink: 1;\n  }\n\n  .flex-shrink-0\\@xs {\n    flex-shrink: 0;\n  }\n\n  .flex-basis-0\\@xs {\n    flex-basis: 0;\n  }\n\n  .justify-start\\@xs {\n    justify-content: flex-start;\n  }\n\n  .justify-end\\@xs {\n    justify-content: flex-end;\n  }\n\n  .justify-center\\@xs {\n    justify-content: center;\n  }\n\n  .justify-between\\@xs {\n    justify-content: space-between;\n  }\n\n  .items-center\\@xs {\n    align-items: center;\n  }\n\n  .items-start\\@xs {\n    align-items: flex-start;\n  }\n\n  .items-end\\@xs {\n    align-items: flex-end;\n  }\n\n  .items-baseline\\@xs {\n    align-items: baseline;\n  }\n\n  .order-1\\@xs {\n    order: 1;\n  }\n\n  .order-2\\@xs {\n    order: 2;\n  }\n\n  .order-3\\@xs {\n    order: 3;\n  }\n\n  .block\\@xs {\n    display: block;\n  }\n\n  .inline-block\\@xs {\n    display: inline-block;\n  }\n\n  .inline\\@xs {\n    display: inline;\n  }\n\n  @supports (--css: variables) {\n    .margin-xxxxs\\@xs {\n      margin: var(--space-xxxxs);\n    }\n\n    .margin-xxxs\\@xs {\n      margin: var(--space-xxxs);\n    }\n\n    .margin-xxs\\@xs {\n      margin: var(--space-xxs);\n    }\n\n    .margin-xs\\@xs {\n      margin: var(--space-xs);\n    }\n\n    .margin-sm\\@xs {\n      margin: var(--space-sm);\n    }\n\n    .margin-md\\@xs {\n      margin: var(--space-md);\n    }\n\n    .margin-lg\\@xs {\n      margin: var(--space-lg);\n    }\n\n    .margin-xl\\@xs {\n      margin: var(--space-xl);\n    }\n\n    .margin-xxl\\@xs {\n      margin: var(--space-xxl);\n    }\n\n    .margin-xxxl\\@xs {\n      margin: var(--space-xxxl);\n    }\n\n    .margin-xxxxl\\@xs {\n      margin: var(--space-xxxxl);\n    }\n\n    .margin-auto\\@xs {\n      margin: auto;\n    }\n\n    .margin-0\\@xs {\n      margin: 0;\n    }\n\n    .margin-top-xxxxs\\@xs {\n      margin-top: var(--space-xxxxs);\n    }\n\n    .margin-top-xxxs\\@xs {\n      margin-top: var(--space-xxxs);\n    }\n\n    .margin-top-xxs\\@xs {\n      margin-top: var(--space-xxs);\n    }\n\n    .margin-top-xs\\@xs {\n      margin-top: var(--space-xs);\n    }\n\n    .margin-top-sm\\@xs {\n      margin-top: var(--space-sm);\n    }\n\n    .margin-top-md\\@xs {\n      margin-top: var(--space-md);\n    }\n\n    .margin-top-lg\\@xs {\n      margin-top: var(--space-lg);\n    }\n\n    .margin-top-xl\\@xs {\n      margin-top: var(--space-xl);\n    }\n\n    .margin-top-xxl\\@xs {\n      margin-top: var(--space-xxl);\n    }\n\n    .margin-top-xxxl\\@xs {\n      margin-top: var(--space-xxxl);\n    }\n\n    .margin-top-xxxxl\\@xs {\n      margin-top: var(--space-xxxxl);\n    }\n\n    .margin-top-auto\\@xs {\n      margin-top: auto;\n    }\n\n    .margin-top-0\\@xs {\n      margin-top: 0;\n    }\n\n    .margin-bottom-xxxxs\\@xs {\n      margin-bottom: var(--space-xxxxs);\n    }\n\n    .margin-bottom-xxxs\\@xs {\n      margin-bottom: var(--space-xxxs);\n    }\n\n    .margin-bottom-xxs\\@xs {\n      margin-bottom: var(--space-xxs);\n    }\n\n    .margin-bottom-xs\\@xs {\n      margin-bottom: var(--space-xs);\n    }\n\n    .margin-bottom-sm\\@xs {\n      margin-bottom: var(--space-sm);\n    }\n\n    .margin-bottom-md\\@xs {\n      margin-bottom: var(--space-md);\n    }\n\n    .margin-bottom-lg\\@xs {\n      margin-bottom: var(--space-lg);\n    }\n\n    .margin-bottom-xl\\@xs {\n      margin-bottom: var(--space-xl);\n    }\n\n    .margin-bottom-xxl\\@xs {\n      margin-bottom: var(--space-xxl);\n    }\n\n    .margin-bottom-xxxl\\@xs {\n      margin-bottom: var(--space-xxxl);\n    }\n\n    .margin-bottom-xxxxl\\@xs {\n      margin-bottom: var(--space-xxxxl);\n    }\n\n    .margin-bottom-auto\\@xs {\n      margin-bottom: auto;\n    }\n\n    .margin-bottom-0\\@xs {\n      margin-bottom: 0;\n    }\n\n    .margin-right-xxxxs\\@xs {\n      margin-right: var(--space-xxxxs);\n    }\n\n    .margin-right-xxxs\\@xs {\n      margin-right: var(--space-xxxs);\n    }\n\n    .margin-right-xxs\\@xs {\n      margin-right: var(--space-xxs);\n    }\n\n    .margin-right-xs\\@xs {\n      margin-right: var(--space-xs);\n    }\n\n    .margin-right-sm\\@xs {\n      margin-right: var(--space-sm);\n    }\n\n    .margin-right-md\\@xs {\n      margin-right: var(--space-md);\n    }\n\n    .margin-right-lg\\@xs {\n      margin-right: var(--space-lg);\n    }\n\n    .margin-right-xl\\@xs {\n      margin-right: var(--space-xl);\n    }\n\n    .margin-right-xxl\\@xs {\n      margin-right: var(--space-xxl);\n    }\n\n    .margin-right-xxxl\\@xs {\n      margin-right: var(--space-xxxl);\n    }\n\n    .margin-right-xxxxl\\@xs {\n      margin-right: var(--space-xxxxl);\n    }\n\n    .margin-right-auto\\@xs {\n      margin-right: auto;\n    }\n\n    .margin-right-0\\@xs {\n      margin-right: 0;\n    }\n\n    .margin-left-xxxxs\\@xs {\n      margin-left: var(--space-xxxxs);\n    }\n\n    .margin-left-xxxs\\@xs {\n      margin-left: var(--space-xxxs);\n    }\n\n    .margin-left-xxs\\@xs {\n      margin-left: var(--space-xxs);\n    }\n\n    .margin-left-xs\\@xs {\n      margin-left: var(--space-xs);\n    }\n\n    .margin-left-sm\\@xs {\n      margin-left: var(--space-sm);\n    }\n\n    .margin-left-md\\@xs {\n      margin-left: var(--space-md);\n    }\n\n    .margin-left-lg\\@xs {\n      margin-left: var(--space-lg);\n    }\n\n    .margin-left-xl\\@xs {\n      margin-left: var(--space-xl);\n    }\n\n    .margin-left-xxl\\@xs {\n      margin-left: var(--space-xxl);\n    }\n\n    .margin-left-xxxl\\@xs {\n      margin-left: var(--space-xxxl);\n    }\n\n    .margin-left-xxxxl\\@xs {\n      margin-left: var(--space-xxxxl);\n    }\n\n    .margin-left-auto\\@xs {\n      margin-left: auto;\n    }\n\n    .margin-left-0\\@xs {\n      margin-left: 0;\n    }\n\n    .margin-x-xxxxs\\@xs {\n      margin-left: var(--space-xxxxs);\n      margin-right: var(--space-xxxxs);\n    }\n\n    .margin-x-xxxs\\@xs {\n      margin-left: var(--space-xxxs);\n      margin-right: var(--space-xxxs);\n    }\n\n    .margin-x-xxs\\@xs {\n      margin-left: var(--space-xxs);\n      margin-right: var(--space-xxs);\n    }\n\n    .margin-x-xs\\@xs {\n      margin-left: var(--space-xs);\n      margin-right: var(--space-xs);\n    }\n\n    .margin-x-sm\\@xs {\n      margin-left: var(--space-sm);\n      margin-right: var(--space-sm);\n    }\n\n    .margin-x-md\\@xs {\n      margin-left: var(--space-md);\n      margin-right: var(--space-md);\n    }\n\n    .margin-x-lg\\@xs {\n      margin-left: var(--space-lg);\n      margin-right: var(--space-lg);\n    }\n\n    .margin-x-xl\\@xs {\n      margin-left: var(--space-xl);\n      margin-right: var(--space-xl);\n    }\n\n    .margin-x-xxl\\@xs {\n      margin-left: var(--space-xxl);\n      margin-right: var(--space-xxl);\n    }\n\n    .margin-x-xxxl\\@xs {\n      margin-left: var(--space-xxxl);\n      margin-right: var(--space-xxxl);\n    }\n\n    .margin-x-xxxxl\\@xs {\n      margin-left: var(--space-xxxxl);\n      margin-right: var(--space-xxxxl);\n    }\n\n    .margin-x-auto\\@xs {\n      margin-left: auto;\n      margin-right: auto;\n    }\n\n    .margin-x-0\\@xs {\n      margin-left: 0;\n      margin-right: 0;\n    }\n\n    .margin-y-xxxxs\\@xs {\n      margin-top: var(--space-xxxxs);\n      margin-bottom: var(--space-xxxxs);\n    }\n\n    .margin-y-xxxs\\@xs {\n      margin-top: var(--space-xxxs);\n      margin-bottom: var(--space-xxxs);\n    }\n\n    .margin-y-xxs\\@xs {\n      margin-top: var(--space-xxs);\n      margin-bottom: var(--space-xxs);\n    }\n\n    .margin-y-xs\\@xs {\n      margin-top: var(--space-xs);\n      margin-bottom: var(--space-xs);\n    }\n\n    .margin-y-sm\\@xs {\n      margin-top: var(--space-sm);\n      margin-bottom: var(--space-sm);\n    }\n\n    .margin-y-md\\@xs {\n      margin-top: var(--space-md);\n      margin-bottom: var(--space-md);\n    }\n\n    .margin-y-lg\\@xs {\n      margin-top: var(--space-lg);\n      margin-bottom: var(--space-lg);\n    }\n\n    .margin-y-xl\\@xs {\n      margin-top: var(--space-xl);\n      margin-bottom: var(--space-xl);\n    }\n\n    .margin-y-xxl\\@xs {\n      margin-top: var(--space-xxl);\n      margin-bottom: var(--space-xxl);\n    }\n\n    .margin-y-xxxl\\@xs {\n      margin-top: var(--space-xxxl);\n      margin-bottom: var(--space-xxxl);\n    }\n\n    .margin-y-xxxxl\\@xs {\n      margin-top: var(--space-xxxxl);\n      margin-bottom: var(--space-xxxxl);\n    }\n\n    .margin-y-auto\\@xs {\n      margin-top: auto;\n      margin-bottom: auto;\n    }\n\n    .margin-y-0\\@xs {\n      margin-top: 0;\n      margin-bottom: 0;\n    }\n  }\n  @supports (--css: variables) {\n    .padding-xxxxs\\@xs {\n      padding: var(--space-xxxxs);\n    }\n\n    .padding-xxxs\\@xs {\n      padding: var(--space-xxxs);\n    }\n\n    .padding-xxs\\@xs {\n      padding: var(--space-xxs);\n    }\n\n    .padding-xs\\@xs {\n      padding: var(--space-xs);\n    }\n\n    .padding-sm\\@xs {\n      padding: var(--space-sm);\n    }\n\n    .padding-md\\@xs {\n      padding: var(--space-md);\n    }\n\n    .padding-lg\\@xs {\n      padding: var(--space-lg);\n    }\n\n    .padding-xl\\@xs {\n      padding: var(--space-xl);\n    }\n\n    .padding-xxl\\@xs {\n      padding: var(--space-xxl);\n    }\n\n    .padding-xxxl\\@xs {\n      padding: var(--space-xxxl);\n    }\n\n    .padding-xxxxl\\@xs {\n      padding: var(--space-xxxxl);\n    }\n\n    .padding-0\\@xs {\n      padding: 0;\n    }\n\n    .padding-component\\@xs {\n      padding: var(--component-padding);\n    }\n\n    .padding-top-xxxxs\\@xs {\n      padding-top: var(--space-xxxxs);\n    }\n\n    .padding-top-xxxs\\@xs {\n      padding-top: var(--space-xxxs);\n    }\n\n    .padding-top-xxs\\@xs {\n      padding-top: var(--space-xxs);\n    }\n\n    .padding-top-xs\\@xs {\n      padding-top: var(--space-xs);\n    }\n\n    .padding-top-sm\\@xs {\n      padding-top: var(--space-sm);\n    }\n\n    .padding-top-md\\@xs {\n      padding-top: var(--space-md);\n    }\n\n    .padding-top-lg\\@xs {\n      padding-top: var(--space-lg);\n    }\n\n    .padding-top-xl\\@xs {\n      padding-top: var(--space-xl);\n    }\n\n    .padding-top-xxl\\@xs {\n      padding-top: var(--space-xxl);\n    }\n\n    .padding-top-xxxl\\@xs {\n      padding-top: var(--space-xxxl);\n    }\n\n    .padding-top-xxxxl\\@xs {\n      padding-top: var(--space-xxxxl);\n    }\n\n    .padding-top-0\\@xs {\n      padding-top: 0;\n    }\n\n    .padding-top-component\\@xs {\n      padding-top: var(--component-padding);\n    }\n\n    .padding-bottom-xxxxs\\@xs {\n      padding-bottom: var(--space-xxxxs);\n    }\n\n    .padding-bottom-xxxs\\@xs {\n      padding-bottom: var(--space-xxxs);\n    }\n\n    .padding-bottom-xxs\\@xs {\n      padding-bottom: var(--space-xxs);\n    }\n\n    .padding-bottom-xs\\@xs {\n      padding-bottom: var(--space-xs);\n    }\n\n    .padding-bottom-sm\\@xs {\n      padding-bottom: var(--space-sm);\n    }\n\n    .padding-bottom-md\\@xs {\n      padding-bottom: var(--space-md);\n    }\n\n    .padding-bottom-lg\\@xs {\n      padding-bottom: var(--space-lg);\n    }\n\n    .padding-bottom-xl\\@xs {\n      padding-bottom: var(--space-xl);\n    }\n\n    .padding-bottom-xxl\\@xs {\n      padding-bottom: var(--space-xxl);\n    }\n\n    .padding-bottom-xxxl\\@xs {\n      padding-bottom: var(--space-xxxl);\n    }\n\n    .padding-bottom-xxxxl\\@xs {\n      padding-bottom: var(--space-xxxxl);\n    }\n\n    .padding-bottom-0\\@xs {\n      padding-bottom: 0;\n    }\n\n    .padding-bottom-component\\@xs {\n      padding-bottom: var(--component-padding);\n    }\n\n    .padding-right-xxxxs\\@xs {\n      padding-right: var(--space-xxxxs);\n    }\n\n    .padding-right-xxxs\\@xs {\n      padding-right: var(--space-xxxs);\n    }\n\n    .padding-right-xxs\\@xs {\n      padding-right: var(--space-xxs);\n    }\n\n    .padding-right-xs\\@xs {\n      padding-right: var(--space-xs);\n    }\n\n    .padding-right-sm\\@xs {\n      padding-right: var(--space-sm);\n    }\n\n    .padding-right-md\\@xs {\n      padding-right: var(--space-md);\n    }\n\n    .padding-right-lg\\@xs {\n      padding-right: var(--space-lg);\n    }\n\n    .padding-right-xl\\@xs {\n      padding-right: var(--space-xl);\n    }\n\n    .padding-right-xxl\\@xs {\n      padding-right: var(--space-xxl);\n    }\n\n    .padding-right-xxxl\\@xs {\n      padding-right: var(--space-xxxl);\n    }\n\n    .padding-right-xxxxl\\@xs {\n      padding-right: var(--space-xxxxl);\n    }\n\n    .padding-right-0\\@xs {\n      padding-right: 0;\n    }\n\n    .padding-right-component\\@xs {\n      padding-right: var(--component-padding);\n    }\n\n    .padding-left-xxxxs\\@xs {\n      padding-left: var(--space-xxxxs);\n    }\n\n    .padding-left-xxxs\\@xs {\n      padding-left: var(--space-xxxs);\n    }\n\n    .padding-left-xxs\\@xs {\n      padding-left: var(--space-xxs);\n    }\n\n    .padding-left-xs\\@xs {\n      padding-left: var(--space-xs);\n    }\n\n    .padding-left-sm\\@xs {\n      padding-left: var(--space-sm);\n    }\n\n    .padding-left-md\\@xs {\n      padding-left: var(--space-md);\n    }\n\n    .padding-left-lg\\@xs {\n      padding-left: var(--space-lg);\n    }\n\n    .padding-left-xl\\@xs {\n      padding-left: var(--space-xl);\n    }\n\n    .padding-left-xxl\\@xs {\n      padding-left: var(--space-xxl);\n    }\n\n    .padding-left-xxxl\\@xs {\n      padding-left: var(--space-xxxl);\n    }\n\n    .padding-left-xxxxl\\@xs {\n      padding-left: var(--space-xxxxl);\n    }\n\n    .padding-left-0\\@xs {\n      padding-left: 0;\n    }\n\n    .padding-left-component\\@xs {\n      padding-left: var(--component-padding);\n    }\n\n    .padding-x-xxxxs\\@xs {\n      padding-left: var(--space-xxxxs);\n      padding-right: var(--space-xxxxs);\n    }\n\n    .padding-x-xxxs\\@xs {\n      padding-left: var(--space-xxxs);\n      padding-right: var(--space-xxxs);\n    }\n\n    .padding-x-xxs\\@xs {\n      padding-left: var(--space-xxs);\n      padding-right: var(--space-xxs);\n    }\n\n    .padding-x-xs\\@xs {\n      padding-left: var(--space-xs);\n      padding-right: var(--space-xs);\n    }\n\n    .padding-x-sm\\@xs {\n      padding-left: var(--space-sm);\n      padding-right: var(--space-sm);\n    }\n\n    .padding-x-md\\@xs {\n      padding-left: var(--space-md);\n      padding-right: var(--space-md);\n    }\n\n    .padding-x-lg\\@xs {\n      padding-left: var(--space-lg);\n      padding-right: var(--space-lg);\n    }\n\n    .padding-x-xl\\@xs {\n      padding-left: var(--space-xl);\n      padding-right: var(--space-xl);\n    }\n\n    .padding-x-xxl\\@xs {\n      padding-left: var(--space-xxl);\n      padding-right: var(--space-xxl);\n    }\n\n    .padding-x-xxxl\\@xs {\n      padding-left: var(--space-xxxl);\n      padding-right: var(--space-xxxl);\n    }\n\n    .padding-x-xxxxl\\@xs {\n      padding-left: var(--space-xxxxl);\n      padding-right: var(--space-xxxxl);\n    }\n\n    .padding-x-0\\@xs {\n      padding-left: 0;\n      padding-right: 0;\n    }\n\n    .padding-x-component\\@xs {\n      padding-left: var(--component-padding);\n      padding-right: var(--component-padding);\n    }\n\n    .padding-y-xxxxs\\@xs {\n      padding-top: var(--space-xxxxs);\n      padding-bottom: var(--space-xxxxs);\n    }\n\n    .padding-y-xxxs\\@xs {\n      padding-top: var(--space-xxxs);\n      padding-bottom: var(--space-xxxs);\n    }\n\n    .padding-y-xxs\\@xs {\n      padding-top: var(--space-xxs);\n      padding-bottom: var(--space-xxs);\n    }\n\n    .padding-y-xs\\@xs {\n      padding-top: var(--space-xs);\n      padding-bottom: var(--space-xs);\n    }\n\n    .padding-y-sm\\@xs {\n      padding-top: var(--space-sm);\n      padding-bottom: var(--space-sm);\n    }\n\n    .padding-y-md\\@xs {\n      padding-top: var(--space-md);\n      padding-bottom: var(--space-md);\n    }\n\n    .padding-y-lg\\@xs {\n      padding-top: var(--space-lg);\n      padding-bottom: var(--space-lg);\n    }\n\n    .padding-y-xl\\@xs {\n      padding-top: var(--space-xl);\n      padding-bottom: var(--space-xl);\n    }\n\n    .padding-y-xxl\\@xs {\n      padding-top: var(--space-xxl);\n      padding-bottom: var(--space-xxl);\n    }\n\n    .padding-y-xxxl\\@xs {\n      padding-top: var(--space-xxxl);\n      padding-bottom: var(--space-xxxl);\n    }\n\n    .padding-y-xxxxl\\@xs {\n      padding-top: var(--space-xxxxl);\n      padding-bottom: var(--space-xxxxl);\n    }\n\n    .padding-y-0\\@xs {\n      padding-top: 0;\n      padding-bottom: 0;\n    }\n\n    .padding-y-component\\@xs {\n      padding-top: var(--component-padding);\n      padding-bottom: var(--component-padding);\n    }\n  }\n  .text-center\\@xs {\n    text-align: center;\n  }\n\n  .text-left\\@xs {\n    text-align: left;\n  }\n\n  .text-right\\@xs {\n    text-align: right;\n  }\n\n  .text-justify\\@xs {\n    text-align: justify;\n  }\n\n  @supports (--css: variables) {\n    .text-xs\\@xs {\n      font-size: var(--text-xs, 0.694em);\n    }\n\n    .text-sm\\@xs {\n      font-size: var(--text-sm, 0.833em);\n    }\n\n    .text-base\\@xs {\n      font-size: var(--text-unit, 1em);\n    }\n\n    .text-md\\@xs {\n      font-size: var(--text-md, 1.2em);\n    }\n\n    .text-lg\\@xs {\n      font-size: var(--text-lg, 1.44em);\n    }\n\n    .text-xl\\@xs {\n      font-size: var(--text-xl, 1.728em);\n    }\n\n    .text-xxl\\@xs {\n      font-size: var(--text-xxl, 2.074em);\n    }\n\n    .text-xxxl\\@xs {\n      font-size: var(--text-xxxl, 2.488em);\n    }\n\n    .text-xxxxl\\@xs {\n      font-size: var(--text-xxxxl, 2.985em);\n    }\n  }\n  @supports (--css: variables) {\n    .width-xxxxs\\@xs {\n      width: var(--size-xxxxs, 0.25rem);\n    }\n\n    .width-xxxs\\@xs {\n      width: var(--size-xxxs, 0.5rem);\n    }\n\n    .width-xxs\\@xs {\n      width: var(--size-xxs, 0.75rem);\n    }\n\n    .width-xs\\@xs {\n      width: var(--size-xs, 1rem);\n    }\n\n    .width-sm\\@xs {\n      width: var(--size-sm, 1.5rem);\n    }\n\n    .width-md\\@xs {\n      width: var(--size-md, 2rem);\n    }\n\n    .width-lg\\@xs {\n      width: var(--size-lg, 3rem);\n    }\n\n    .width-xl\\@xs {\n      width: var(--size-xl, 4rem);\n    }\n\n    .width-xxl\\@xs {\n      width: var(--size-xxl, 6rem);\n    }\n\n    .width-xxxl\\@xs {\n      width: var(--size-xxxl, 8rem);\n    }\n\n    .width-xxxxl\\@xs {\n      width: var(--size-xxxxl, 16rem);\n    }\n  }\n  .width-0\\@xs {\n    width: 0;\n  }\n\n  .width-10\\%\\@xs {\n    width: 10%;\n  }\n\n  .width-20\\%\\@xs {\n    width: 20%;\n  }\n\n  .width-25\\%\\@xs {\n    width: 25%;\n  }\n\n  .width-30\\%\\@xs {\n    width: 30%;\n  }\n\n  .width-33\\%\\@xs {\n    width: calc(100% / 3);\n  }\n\n  .width-40\\%\\@xs {\n    width: 40%;\n  }\n\n  .width-50\\%\\@xs {\n    width: 50%;\n  }\n\n  .width-60\\%\\@xs {\n    width: 60%;\n  }\n\n  .width-66\\%\\@xs {\n    width: calc(100% / 1.5);\n  }\n\n  .width-70\\%\\@xs {\n    width: 70%;\n  }\n\n  .width-75\\%\\@xs {\n    width: 75%;\n  }\n\n  .width-80\\%\\@xs {\n    width: 80%;\n  }\n\n  .width-90\\%\\@xs {\n    width: 90%;\n  }\n\n  .width-100\\%\\@xs {\n    width: 100%;\n  }\n\n  .width-100vw\\@xs {\n    width: 100vw;\n  }\n\n  .width-auto\\@xs {\n    width: auto;\n  }\n\n  @supports (--css: variables) {\n    .height-xxxxs\\@xs {\n      height: var(--size-xxxxs, 0.25rem);\n    }\n\n    .height-xxxs\\@xs {\n      height: var(--size-xxxs, 0.5rem);\n    }\n\n    .height-xxs\\@xs {\n      height: var(--size-xxs, 0.75rem);\n    }\n\n    .height-xs\\@xs {\n      height: var(--size-xs, 1rem);\n    }\n\n    .height-sm\\@xs {\n      height: var(--size-sm, 1.5rem);\n    }\n\n    .height-md\\@xs {\n      height: var(--size-md, 2rem);\n    }\n\n    .height-lg\\@xs {\n      height: var(--size-lg, 3rem);\n    }\n\n    .height-xl\\@xs {\n      height: var(--size-xl, 4rem);\n    }\n\n    .height-xxl\\@xs {\n      height: var(--size-xxl, 6rem);\n    }\n\n    .height-xxxl\\@xs {\n      height: var(--size-xxxl, 8rem);\n    }\n\n    .height-xxxxl\\@xs {\n      height: var(--size-xxxxl, 16rem);\n    }\n  }\n  .height-0\\@xs {\n    height: 0;\n  }\n\n  .height-10\\%\\@xs {\n    height: 10%;\n  }\n\n  .height-20\\%\\@xs {\n    height: 20%;\n  }\n\n  .height-25\\%\\@xs {\n    height: 25%;\n  }\n\n  .height-30\\%\\@xs {\n    height: 30%;\n  }\n\n  .height-33\\%\\@xs {\n    height: calc(100% / 3);\n  }\n\n  .height-40\\%\\@xs {\n    height: 40%;\n  }\n\n  .height-50\\%\\@xs {\n    height: 50%;\n  }\n\n  .height-60\\%\\@xs {\n    height: 60%;\n  }\n\n  .height-66\\%\\@xs {\n    height: calc(100% / 1.5);\n  }\n\n  .height-70\\%\\@xs {\n    height: 70%;\n  }\n\n  .height-75\\%\\@xs {\n    height: 75%;\n  }\n\n  .height-80\\%\\@xs {\n    height: 80%;\n  }\n\n  .height-90\\%\\@xs {\n    height: 90%;\n  }\n\n  .height-100\\%\\@xs {\n    height: 100%;\n  }\n\n  .height-100vh\\@xs {\n    height: 100vh;\n  }\n\n  .height-auto\\@xs {\n    height: auto;\n  }\n\n  .position-relative\\@xs {\n    position: relative;\n  }\n\n  .position-absolute\\@xs {\n    position: absolute;\n  }\n\n  .position-fixed\\@xs {\n    position: fixed;\n  }\n\n  .position-sticky\\@xs {\n    position: sticky;\n  }\n\n  .position-static\\@xs {\n    position: static;\n  }\n\n  .top-0\\@xs {\n    top: 0;\n  }\n\n  .top-50\\%\\@xs {\n    top: 50%;\n  }\n\n  .bottom-0\\@xs {\n    bottom: 0;\n  }\n\n  .bottom-50\\%\\@xs {\n    bottom: 50%;\n  }\n\n  .left-0\\@xs {\n    left: 0;\n  }\n\n  .left-50\\%\\@xs {\n    left: 50%;\n  }\n\n  .right-0\\@xs {\n    right: 0;\n  }\n\n  .right-50\\%\\@xs {\n    right: 50%;\n  }\n\n  .inset-0\\@xs {\n    top: 0;\n    right: 0;\n    bottom: 0;\n    left: 0;\n  }\n\n  .hide\\@xs {\n    display: none !important;\n  }\n}\n@media not all and (min-width: 32rem) {\n  .has-margin\\@xs {\n    margin: 0 !important;\n  }\n\n  .has-padding\\@xs {\n    padding: 0 !important;\n  }\n\n  .display\\@xs {\n    display: none !important;\n  }\n}\n@media (min-width: 48rem) {\n  .flex\\@sm {\n    display: flex;\n  }\n\n  .inline-flex\\@sm {\n    display: inline-flex;\n  }\n\n  .flex-wrap\\@sm {\n    flex-wrap: wrap;\n  }\n\n  .flex-column\\@sm {\n    flex-direction: column;\n  }\n\n  .flex-column-reverse\\@sm {\n    flex-direction: column-reverse;\n  }\n\n  .flex-row\\@sm {\n    flex-direction: row;\n  }\n\n  .flex-row-reverse\\@sm {\n    flex-direction: row-reverse;\n  }\n\n  .flex-center\\@sm {\n    justify-content: center;\n    align-items: center;\n  }\n\n  .flex-grow\\@sm {\n    flex-grow: 1;\n  }\n\n  .flex-grow-0\\@sm {\n    flex-grow: 0;\n  }\n\n  .flex-shrink\\@sm {\n    flex-shrink: 1;\n  }\n\n  .flex-shrink-0\\@sm {\n    flex-shrink: 0;\n  }\n\n  .flex-basis-0\\@sm {\n    flex-basis: 0;\n  }\n\n  .justify-start\\@sm {\n    justify-content: flex-start;\n  }\n\n  .justify-end\\@sm {\n    justify-content: flex-end;\n  }\n\n  .justify-center\\@sm {\n    justify-content: center;\n  }\n\n  .justify-between\\@sm {\n    justify-content: space-between;\n  }\n\n  .items-center\\@sm {\n    align-items: center;\n  }\n\n  .items-start\\@sm {\n    align-items: flex-start;\n  }\n\n  .items-end\\@sm {\n    align-items: flex-end;\n  }\n\n  .items-baseline\\@sm {\n    align-items: baseline;\n  }\n\n  .order-1\\@sm {\n    order: 1;\n  }\n\n  .order-2\\@sm {\n    order: 2;\n  }\n\n  .order-3\\@sm {\n    order: 3;\n  }\n\n  .block\\@sm {\n    display: block;\n  }\n\n  .inline-block\\@sm {\n    display: inline-block;\n  }\n\n  .inline\\@sm {\n    display: inline;\n  }\n\n  @supports (--css: variables) {\n    .margin-xxxxs\\@sm {\n      margin: var(--space-xxxxs);\n    }\n\n    .margin-xxxs\\@sm {\n      margin: var(--space-xxxs);\n    }\n\n    .margin-xxs\\@sm {\n      margin: var(--space-xxs);\n    }\n\n    .margin-xs\\@sm {\n      margin: var(--space-xs);\n    }\n\n    .margin-sm\\@sm {\n      margin: var(--space-sm);\n    }\n\n    .margin-md\\@sm {\n      margin: var(--space-md);\n    }\n\n    .margin-lg\\@sm {\n      margin: var(--space-lg);\n    }\n\n    .margin-xl\\@sm {\n      margin: var(--space-xl);\n    }\n\n    .margin-xxl\\@sm {\n      margin: var(--space-xxl);\n    }\n\n    .margin-xxxl\\@sm {\n      margin: var(--space-xxxl);\n    }\n\n    .margin-xxxxl\\@sm {\n      margin: var(--space-xxxxl);\n    }\n\n    .margin-auto\\@sm {\n      margin: auto;\n    }\n\n    .margin-0\\@sm {\n      margin: 0;\n    }\n\n    .margin-top-xxxxs\\@sm {\n      margin-top: var(--space-xxxxs);\n    }\n\n    .margin-top-xxxs\\@sm {\n      margin-top: var(--space-xxxs);\n    }\n\n    .margin-top-xxs\\@sm {\n      margin-top: var(--space-xxs);\n    }\n\n    .margin-top-xs\\@sm {\n      margin-top: var(--space-xs);\n    }\n\n    .margin-top-sm\\@sm {\n      margin-top: var(--space-sm);\n    }\n\n    .margin-top-md\\@sm {\n      margin-top: var(--space-md);\n    }\n\n    .margin-top-lg\\@sm {\n      margin-top: var(--space-lg);\n    }\n\n    .margin-top-xl\\@sm {\n      margin-top: var(--space-xl);\n    }\n\n    .margin-top-xxl\\@sm {\n      margin-top: var(--space-xxl);\n    }\n\n    .margin-top-xxxl\\@sm {\n      margin-top: var(--space-xxxl);\n    }\n\n    .margin-top-xxxxl\\@sm {\n      margin-top: var(--space-xxxxl);\n    }\n\n    .margin-top-auto\\@sm {\n      margin-top: auto;\n    }\n\n    .margin-top-0\\@sm {\n      margin-top: 0;\n    }\n\n    .margin-bottom-xxxxs\\@sm {\n      margin-bottom: var(--space-xxxxs);\n    }\n\n    .margin-bottom-xxxs\\@sm {\n      margin-bottom: var(--space-xxxs);\n    }\n\n    .margin-bottom-xxs\\@sm {\n      margin-bottom: var(--space-xxs);\n    }\n\n    .margin-bottom-xs\\@sm {\n      margin-bottom: var(--space-xs);\n    }\n\n    .margin-bottom-sm\\@sm {\n      margin-bottom: var(--space-sm);\n    }\n\n    .margin-bottom-md\\@sm {\n      margin-bottom: var(--space-md);\n    }\n\n    .margin-bottom-lg\\@sm {\n      margin-bottom: var(--space-lg);\n    }\n\n    .margin-bottom-xl\\@sm {\n      margin-bottom: var(--space-xl);\n    }\n\n    .margin-bottom-xxl\\@sm {\n      margin-bottom: var(--space-xxl);\n    }\n\n    .margin-bottom-xxxl\\@sm {\n      margin-bottom: var(--space-xxxl);\n    }\n\n    .margin-bottom-xxxxl\\@sm {\n      margin-bottom: var(--space-xxxxl);\n    }\n\n    .margin-bottom-auto\\@sm {\n      margin-bottom: auto;\n    }\n\n    .margin-bottom-0\\@sm {\n      margin-bottom: 0;\n    }\n\n    .margin-right-xxxxs\\@sm {\n      margin-right: var(--space-xxxxs);\n    }\n\n    .margin-right-xxxs\\@sm {\n      margin-right: var(--space-xxxs);\n    }\n\n    .margin-right-xxs\\@sm {\n      margin-right: var(--space-xxs);\n    }\n\n    .margin-right-xs\\@sm {\n      margin-right: var(--space-xs);\n    }\n\n    .margin-right-sm\\@sm {\n      margin-right: var(--space-sm);\n    }\n\n    .margin-right-md\\@sm {\n      margin-right: var(--space-md);\n    }\n\n    .margin-right-lg\\@sm {\n      margin-right: var(--space-lg);\n    }\n\n    .margin-right-xl\\@sm {\n      margin-right: var(--space-xl);\n    }\n\n    .margin-right-xxl\\@sm {\n      margin-right: var(--space-xxl);\n    }\n\n    .margin-right-xxxl\\@sm {\n      margin-right: var(--space-xxxl);\n    }\n\n    .margin-right-xxxxl\\@sm {\n      margin-right: var(--space-xxxxl);\n    }\n\n    .margin-right-auto\\@sm {\n      margin-right: auto;\n    }\n\n    .margin-right-0\\@sm {\n      margin-right: 0;\n    }\n\n    .margin-left-xxxxs\\@sm {\n      margin-left: var(--space-xxxxs);\n    }\n\n    .margin-left-xxxs\\@sm {\n      margin-left: var(--space-xxxs);\n    }\n\n    .margin-left-xxs\\@sm {\n      margin-left: var(--space-xxs);\n    }\n\n    .margin-left-xs\\@sm {\n      margin-left: var(--space-xs);\n    }\n\n    .margin-left-sm\\@sm {\n      margin-left: var(--space-sm);\n    }\n\n    .margin-left-md\\@sm {\n      margin-left: var(--space-md);\n    }\n\n    .margin-left-lg\\@sm {\n      margin-left: var(--space-lg);\n    }\n\n    .margin-left-xl\\@sm {\n      margin-left: var(--space-xl);\n    }\n\n    .margin-left-xxl\\@sm {\n      margin-left: var(--space-xxl);\n    }\n\n    .margin-left-xxxl\\@sm {\n      margin-left: var(--space-xxxl);\n    }\n\n    .margin-left-xxxxl\\@sm {\n      margin-left: var(--space-xxxxl);\n    }\n\n    .margin-left-auto\\@sm {\n      margin-left: auto;\n    }\n\n    .margin-left-0\\@sm {\n      margin-left: 0;\n    }\n\n    .margin-x-xxxxs\\@sm {\n      margin-left: var(--space-xxxxs);\n      margin-right: var(--space-xxxxs);\n    }\n\n    .margin-x-xxxs\\@sm {\n      margin-left: var(--space-xxxs);\n      margin-right: var(--space-xxxs);\n    }\n\n    .margin-x-xxs\\@sm {\n      margin-left: var(--space-xxs);\n      margin-right: var(--space-xxs);\n    }\n\n    .margin-x-xs\\@sm {\n      margin-left: var(--space-xs);\n      margin-right: var(--space-xs);\n    }\n\n    .margin-x-sm\\@sm {\n      margin-left: var(--space-sm);\n      margin-right: var(--space-sm);\n    }\n\n    .margin-x-md\\@sm {\n      margin-left: var(--space-md);\n      margin-right: var(--space-md);\n    }\n\n    .margin-x-lg\\@sm {\n      margin-left: var(--space-lg);\n      margin-right: var(--space-lg);\n    }\n\n    .margin-x-xl\\@sm {\n      margin-left: var(--space-xl);\n      margin-right: var(--space-xl);\n    }\n\n    .margin-x-xxl\\@sm {\n      margin-left: var(--space-xxl);\n      margin-right: var(--space-xxl);\n    }\n\n    .margin-x-xxxl\\@sm {\n      margin-left: var(--space-xxxl);\n      margin-right: var(--space-xxxl);\n    }\n\n    .margin-x-xxxxl\\@sm {\n      margin-left: var(--space-xxxxl);\n      margin-right: var(--space-xxxxl);\n    }\n\n    .margin-x-auto\\@sm {\n      margin-left: auto;\n      margin-right: auto;\n    }\n\n    .margin-x-0\\@sm {\n      margin-left: 0;\n      margin-right: 0;\n    }\n\n    .margin-y-xxxxs\\@sm {\n      margin-top: var(--space-xxxxs);\n      margin-bottom: var(--space-xxxxs);\n    }\n\n    .margin-y-xxxs\\@sm {\n      margin-top: var(--space-xxxs);\n      margin-bottom: var(--space-xxxs);\n    }\n\n    .margin-y-xxs\\@sm {\n      margin-top: var(--space-xxs);\n      margin-bottom: var(--space-xxs);\n    }\n\n    .margin-y-xs\\@sm {\n      margin-top: var(--space-xs);\n      margin-bottom: var(--space-xs);\n    }\n\n    .margin-y-sm\\@sm {\n      margin-top: var(--space-sm);\n      margin-bottom: var(--space-sm);\n    }\n\n    .margin-y-md\\@sm {\n      margin-top: var(--space-md);\n      margin-bottom: var(--space-md);\n    }\n\n    .margin-y-lg\\@sm {\n      margin-top: var(--space-lg);\n      margin-bottom: var(--space-lg);\n    }\n\n    .margin-y-xl\\@sm {\n      margin-top: var(--space-xl);\n      margin-bottom: var(--space-xl);\n    }\n\n    .margin-y-xxl\\@sm {\n      margin-top: var(--space-xxl);\n      margin-bottom: var(--space-xxl);\n    }\n\n    .margin-y-xxxl\\@sm {\n      margin-top: var(--space-xxxl);\n      margin-bottom: var(--space-xxxl);\n    }\n\n    .margin-y-xxxxl\\@sm {\n      margin-top: var(--space-xxxxl);\n      margin-bottom: var(--space-xxxxl);\n    }\n\n    .margin-y-auto\\@sm {\n      margin-top: auto;\n      margin-bottom: auto;\n    }\n\n    .margin-y-0\\@sm {\n      margin-top: 0;\n      margin-bottom: 0;\n    }\n  }\n  @supports (--css: variables) {\n    .padding-xxxxs\\@sm {\n      padding: var(--space-xxxxs);\n    }\n\n    .padding-xxxs\\@sm {\n      padding: var(--space-xxxs);\n    }\n\n    .padding-xxs\\@sm {\n      padding: var(--space-xxs);\n    }\n\n    .padding-xs\\@sm {\n      padding: var(--space-xs);\n    }\n\n    .padding-sm\\@sm {\n      padding: var(--space-sm);\n    }\n\n    .padding-md\\@sm {\n      padding: var(--space-md);\n    }\n\n    .padding-lg\\@sm {\n      padding: var(--space-lg);\n    }\n\n    .padding-xl\\@sm {\n      padding: var(--space-xl);\n    }\n\n    .padding-xxl\\@sm {\n      padding: var(--space-xxl);\n    }\n\n    .padding-xxxl\\@sm {\n      padding: var(--space-xxxl);\n    }\n\n    .padding-xxxxl\\@sm {\n      padding: var(--space-xxxxl);\n    }\n\n    .padding-0\\@sm {\n      padding: 0;\n    }\n\n    .padding-component\\@sm {\n      padding: var(--component-padding);\n    }\n\n    .padding-top-xxxxs\\@sm {\n      padding-top: var(--space-xxxxs);\n    }\n\n    .padding-top-xxxs\\@sm {\n      padding-top: var(--space-xxxs);\n    }\n\n    .padding-top-xxs\\@sm {\n      padding-top: var(--space-xxs);\n    }\n\n    .padding-top-xs\\@sm {\n      padding-top: var(--space-xs);\n    }\n\n    .padding-top-sm\\@sm {\n      padding-top: var(--space-sm);\n    }\n\n    .padding-top-md\\@sm {\n      padding-top: var(--space-md);\n    }\n\n    .padding-top-lg\\@sm {\n      padding-top: var(--space-lg);\n    }\n\n    .padding-top-xl\\@sm {\n      padding-top: var(--space-xl);\n    }\n\n    .padding-top-xxl\\@sm {\n      padding-top: var(--space-xxl);\n    }\n\n    .padding-top-xxxl\\@sm {\n      padding-top: var(--space-xxxl);\n    }\n\n    .padding-top-xxxxl\\@sm {\n      padding-top: var(--space-xxxxl);\n    }\n\n    .padding-top-0\\@sm {\n      padding-top: 0;\n    }\n\n    .padding-top-component\\@sm {\n      padding-top: var(--component-padding);\n    }\n\n    .padding-bottom-xxxxs\\@sm {\n      padding-bottom: var(--space-xxxxs);\n    }\n\n    .padding-bottom-xxxs\\@sm {\n      padding-bottom: var(--space-xxxs);\n    }\n\n    .padding-bottom-xxs\\@sm {\n      padding-bottom: var(--space-xxs);\n    }\n\n    .padding-bottom-xs\\@sm {\n      padding-bottom: var(--space-xs);\n    }\n\n    .padding-bottom-sm\\@sm {\n      padding-bottom: var(--space-sm);\n    }\n\n    .padding-bottom-md\\@sm {\n      padding-bottom: var(--space-md);\n    }\n\n    .padding-bottom-lg\\@sm {\n      padding-bottom: var(--space-lg);\n    }\n\n    .padding-bottom-xl\\@sm {\n      padding-bottom: var(--space-xl);\n    }\n\n    .padding-bottom-xxl\\@sm {\n      padding-bottom: var(--space-xxl);\n    }\n\n    .padding-bottom-xxxl\\@sm {\n      padding-bottom: var(--space-xxxl);\n    }\n\n    .padding-bottom-xxxxl\\@sm {\n      padding-bottom: var(--space-xxxxl);\n    }\n\n    .padding-bottom-0\\@sm {\n      padding-bottom: 0;\n    }\n\n    .padding-bottom-component\\@sm {\n      padding-bottom: var(--component-padding);\n    }\n\n    .padding-right-xxxxs\\@sm {\n      padding-right: var(--space-xxxxs);\n    }\n\n    .padding-right-xxxs\\@sm {\n      padding-right: var(--space-xxxs);\n    }\n\n    .padding-right-xxs\\@sm {\n      padding-right: var(--space-xxs);\n    }\n\n    .padding-right-xs\\@sm {\n      padding-right: var(--space-xs);\n    }\n\n    .padding-right-sm\\@sm {\n      padding-right: var(--space-sm);\n    }\n\n    .padding-right-md\\@sm {\n      padding-right: var(--space-md);\n    }\n\n    .padding-right-lg\\@sm {\n      padding-right: var(--space-lg);\n    }\n\n    .padding-right-xl\\@sm {\n      padding-right: var(--space-xl);\n    }\n\n    .padding-right-xxl\\@sm {\n      padding-right: var(--space-xxl);\n    }\n\n    .padding-right-xxxl\\@sm {\n      padding-right: var(--space-xxxl);\n    }\n\n    .padding-right-xxxxl\\@sm {\n      padding-right: var(--space-xxxxl);\n    }\n\n    .padding-right-0\\@sm {\n      padding-right: 0;\n    }\n\n    .padding-right-component\\@sm {\n      padding-right: var(--component-padding);\n    }\n\n    .padding-left-xxxxs\\@sm {\n      padding-left: var(--space-xxxxs);\n    }\n\n    .padding-left-xxxs\\@sm {\n      padding-left: var(--space-xxxs);\n    }\n\n    .padding-left-xxs\\@sm {\n      padding-left: var(--space-xxs);\n    }\n\n    .padding-left-xs\\@sm {\n      padding-left: var(--space-xs);\n    }\n\n    .padding-left-sm\\@sm {\n      padding-left: var(--space-sm);\n    }\n\n    .padding-left-md\\@sm {\n      padding-left: var(--space-md);\n    }\n\n    .padding-left-lg\\@sm {\n      padding-left: var(--space-lg);\n    }\n\n    .padding-left-xl\\@sm {\n      padding-left: var(--space-xl);\n    }\n\n    .padding-left-xxl\\@sm {\n      padding-left: var(--space-xxl);\n    }\n\n    .padding-left-xxxl\\@sm {\n      padding-left: var(--space-xxxl);\n    }\n\n    .padding-left-xxxxl\\@sm {\n      padding-left: var(--space-xxxxl);\n    }\n\n    .padding-left-0\\@sm {\n      padding-left: 0;\n    }\n\n    .padding-left-component\\@sm {\n      padding-left: var(--component-padding);\n    }\n\n    .padding-x-xxxxs\\@sm {\n      padding-left: var(--space-xxxxs);\n      padding-right: var(--space-xxxxs);\n    }\n\n    .padding-x-xxxs\\@sm {\n      padding-left: var(--space-xxxs);\n      padding-right: var(--space-xxxs);\n    }\n\n    .padding-x-xxs\\@sm {\n      padding-left: var(--space-xxs);\n      padding-right: var(--space-xxs);\n    }\n\n    .padding-x-xs\\@sm {\n      padding-left: var(--space-xs);\n      padding-right: var(--space-xs);\n    }\n\n    .padding-x-sm\\@sm {\n      padding-left: var(--space-sm);\n      padding-right: var(--space-sm);\n    }\n\n    .padding-x-md\\@sm {\n      padding-left: var(--space-md);\n      padding-right: var(--space-md);\n    }\n\n    .padding-x-lg\\@sm {\n      padding-left: var(--space-lg);\n      padding-right: var(--space-lg);\n    }\n\n    .padding-x-xl\\@sm {\n      padding-left: var(--space-xl);\n      padding-right: var(--space-xl);\n    }\n\n    .padding-x-xxl\\@sm {\n      padding-left: var(--space-xxl);\n      padding-right: var(--space-xxl);\n    }\n\n    .padding-x-xxxl\\@sm {\n      padding-left: var(--space-xxxl);\n      padding-right: var(--space-xxxl);\n    }\n\n    .padding-x-xxxxl\\@sm {\n      padding-left: var(--space-xxxxl);\n      padding-right: var(--space-xxxxl);\n    }\n\n    .padding-x-0\\@sm {\n      padding-left: 0;\n      padding-right: 0;\n    }\n\n    .padding-x-component\\@sm {\n      padding-left: var(--component-padding);\n      padding-right: var(--component-padding);\n    }\n\n    .padding-y-xxxxs\\@sm {\n      padding-top: var(--space-xxxxs);\n      padding-bottom: var(--space-xxxxs);\n    }\n\n    .padding-y-xxxs\\@sm {\n      padding-top: var(--space-xxxs);\n      padding-bottom: var(--space-xxxs);\n    }\n\n    .padding-y-xxs\\@sm {\n      padding-top: var(--space-xxs);\n      padding-bottom: var(--space-xxs);\n    }\n\n    .padding-y-xs\\@sm {\n      padding-top: var(--space-xs);\n      padding-bottom: var(--space-xs);\n    }\n\n    .padding-y-sm\\@sm {\n      padding-top: var(--space-sm);\n      padding-bottom: var(--space-sm);\n    }\n\n    .padding-y-md\\@sm {\n      padding-top: var(--space-md);\n      padding-bottom: var(--space-md);\n    }\n\n    .padding-y-lg\\@sm {\n      padding-top: var(--space-lg);\n      padding-bottom: var(--space-lg);\n    }\n\n    .padding-y-xl\\@sm {\n      padding-top: var(--space-xl);\n      padding-bottom: var(--space-xl);\n    }\n\n    .padding-y-xxl\\@sm {\n      padding-top: var(--space-xxl);\n      padding-bottom: var(--space-xxl);\n    }\n\n    .padding-y-xxxl\\@sm {\n      padding-top: var(--space-xxxl);\n      padding-bottom: var(--space-xxxl);\n    }\n\n    .padding-y-xxxxl\\@sm {\n      padding-top: var(--space-xxxxl);\n      padding-bottom: var(--space-xxxxl);\n    }\n\n    .padding-y-0\\@sm {\n      padding-top: 0;\n      padding-bottom: 0;\n    }\n\n    .padding-y-component\\@sm {\n      padding-top: var(--component-padding);\n      padding-bottom: var(--component-padding);\n    }\n  }\n  .text-center\\@sm {\n    text-align: center;\n  }\n\n  .text-left\\@sm {\n    text-align: left;\n  }\n\n  .text-right\\@sm {\n    text-align: right;\n  }\n\n  .text-justify\\@sm {\n    text-align: justify;\n  }\n\n  @supports (--css: variables) {\n    .text-xs\\@sm {\n      font-size: var(--text-xs, 0.694em);\n    }\n\n    .text-sm\\@sm {\n      font-size: var(--text-sm, 0.833em);\n    }\n\n    .text-base\\@sm {\n      font-size: var(--text-unit, 1em);\n    }\n\n    .text-md\\@sm {\n      font-size: var(--text-md, 1.2em);\n    }\n\n    .text-lg\\@sm {\n      font-size: var(--text-lg, 1.44em);\n    }\n\n    .text-xl\\@sm {\n      font-size: var(--text-xl, 1.728em);\n    }\n\n    .text-xxl\\@sm {\n      font-size: var(--text-xxl, 2.074em);\n    }\n\n    .text-xxxl\\@sm {\n      font-size: var(--text-xxxl, 2.488em);\n    }\n\n    .text-xxxxl\\@sm {\n      font-size: var(--text-xxxxl, 2.985em);\n    }\n  }\n  @supports (--css: variables) {\n    .width-xxxxs\\@sm {\n      width: var(--size-xxxxs, 0.25rem);\n    }\n\n    .width-xxxs\\@sm {\n      width: var(--size-xxxs, 0.5rem);\n    }\n\n    .width-xxs\\@sm {\n      width: var(--size-xxs, 0.75rem);\n    }\n\n    .width-xs\\@sm {\n      width: var(--size-xs, 1rem);\n    }\n\n    .width-sm\\@sm {\n      width: var(--size-sm, 1.5rem);\n    }\n\n    .width-md\\@sm {\n      width: var(--size-md, 2rem);\n    }\n\n    .width-lg\\@sm {\n      width: var(--size-lg, 3rem);\n    }\n\n    .width-xl\\@sm {\n      width: var(--size-xl, 4rem);\n    }\n\n    .width-xxl\\@sm {\n      width: var(--size-xxl, 6rem);\n    }\n\n    .width-xxxl\\@sm {\n      width: var(--size-xxxl, 8rem);\n    }\n\n    .width-xxxxl\\@sm {\n      width: var(--size-xxxxl, 16rem);\n    }\n  }\n  .width-0\\@sm {\n    width: 0;\n  }\n\n  .width-10\\%\\@sm {\n    width: 10%;\n  }\n\n  .width-20\\%\\@sm {\n    width: 20%;\n  }\n\n  .width-25\\%\\@sm {\n    width: 25%;\n  }\n\n  .width-30\\%\\@sm {\n    width: 30%;\n  }\n\n  .width-33\\%\\@sm {\n    width: calc(100% / 3);\n  }\n\n  .width-40\\%\\@sm {\n    width: 40%;\n  }\n\n  .width-50\\%\\@sm {\n    width: 50%;\n  }\n\n  .width-60\\%\\@sm {\n    width: 60%;\n  }\n\n  .width-66\\%\\@sm {\n    width: calc(100% / 1.5);\n  }\n\n  .width-70\\%\\@sm {\n    width: 70%;\n  }\n\n  .width-75\\%\\@sm {\n    width: 75%;\n  }\n\n  .width-80\\%\\@sm {\n    width: 80%;\n  }\n\n  .width-90\\%\\@sm {\n    width: 90%;\n  }\n\n  .width-100\\%\\@sm {\n    width: 100%;\n  }\n\n  .width-100vw\\@sm {\n    width: 100vw;\n  }\n\n  .width-auto\\@sm {\n    width: auto;\n  }\n\n  @supports (--css: variables) {\n    .height-xxxxs\\@sm {\n      height: var(--size-xxxxs, 0.25rem);\n    }\n\n    .height-xxxs\\@sm {\n      height: var(--size-xxxs, 0.5rem);\n    }\n\n    .height-xxs\\@sm {\n      height: var(--size-xxs, 0.75rem);\n    }\n\n    .height-xs\\@sm {\n      height: var(--size-xs, 1rem);\n    }\n\n    .height-sm\\@sm {\n      height: var(--size-sm, 1.5rem);\n    }\n\n    .height-md\\@sm {\n      height: var(--size-md, 2rem);\n    }\n\n    .height-lg\\@sm {\n      height: var(--size-lg, 3rem);\n    }\n\n    .height-xl\\@sm {\n      height: var(--size-xl, 4rem);\n    }\n\n    .height-xxl\\@sm {\n      height: var(--size-xxl, 6rem);\n    }\n\n    .height-xxxl\\@sm {\n      height: var(--size-xxxl, 8rem);\n    }\n\n    .height-xxxxl\\@sm {\n      height: var(--size-xxxxl, 16rem);\n    }\n  }\n  .height-0\\@sm {\n    height: 0;\n  }\n\n  .height-10\\%\\@sm {\n    height: 10%;\n  }\n\n  .height-20\\%\\@sm {\n    height: 20%;\n  }\n\n  .height-25\\%\\@sm {\n    height: 25%;\n  }\n\n  .height-30\\%\\@sm {\n    height: 30%;\n  }\n\n  .height-33\\%\\@sm {\n    height: calc(100% / 3);\n  }\n\n  .height-40\\%\\@sm {\n    height: 40%;\n  }\n\n  .height-50\\%\\@sm {\n    height: 50%;\n  }\n\n  .height-60\\%\\@sm {\n    height: 60%;\n  }\n\n  .height-66\\%\\@sm {\n    height: calc(100% / 1.5);\n  }\n\n  .height-70\\%\\@sm {\n    height: 70%;\n  }\n\n  .height-75\\%\\@sm {\n    height: 75%;\n  }\n\n  .height-80\\%\\@sm {\n    height: 80%;\n  }\n\n  .height-90\\%\\@sm {\n    height: 90%;\n  }\n\n  .height-100\\%\\@sm {\n    height: 100%;\n  }\n\n  .height-100vh\\@sm {\n    height: 100vh;\n  }\n\n  .height-auto\\@sm {\n    height: auto;\n  }\n\n  .position-relative\\@sm {\n    position: relative;\n  }\n\n  .position-absolute\\@sm {\n    position: absolute;\n  }\n\n  .position-fixed\\@sm {\n    position: fixed;\n  }\n\n  .position-sticky\\@sm {\n    position: sticky;\n  }\n\n  .position-static\\@sm {\n    position: static;\n  }\n\n  .top-0\\@sm {\n    top: 0;\n  }\n\n  .top-50\\%\\@sm {\n    top: 50%;\n  }\n\n  .bottom-0\\@sm {\n    bottom: 0;\n  }\n\n  .bottom-50\\%\\@sm {\n    bottom: 50%;\n  }\n\n  .left-0\\@sm {\n    left: 0;\n  }\n\n  .left-50\\%\\@sm {\n    left: 50%;\n  }\n\n  .right-0\\@sm {\n    right: 0;\n  }\n\n  .right-50\\%\\@sm {\n    right: 50%;\n  }\n\n  .inset-0\\@sm {\n    top: 0;\n    right: 0;\n    bottom: 0;\n    left: 0;\n  }\n\n  .hide\\@sm {\n    display: none !important;\n  }\n}\n@media not all and (min-width: 48rem) {\n  .has-margin\\@sm {\n    margin: 0 !important;\n  }\n\n  .has-padding\\@sm {\n    padding: 0 !important;\n  }\n\n  .display\\@sm {\n    display: none !important;\n  }\n}\n@media (min-width: 64rem) {\n  .flex\\@md {\n    display: flex;\n  }\n\n  .inline-flex\\@md {\n    display: inline-flex;\n  }\n\n  .flex-wrap\\@md {\n    flex-wrap: wrap;\n  }\n\n  .flex-column\\@md {\n    flex-direction: column;\n  }\n\n  .flex-column-reverse\\@md {\n    flex-direction: column-reverse;\n  }\n\n  .flex-row\\@md {\n    flex-direction: row;\n  }\n\n  .flex-row-reverse\\@md {\n    flex-direction: row-reverse;\n  }\n\n  .flex-center\\@md {\n    justify-content: center;\n    align-items: center;\n  }\n\n  .flex-grow\\@md {\n    flex-grow: 1;\n  }\n\n  .flex-grow-0\\@md {\n    flex-grow: 0;\n  }\n\n  .flex-shrink\\@md {\n    flex-shrink: 1;\n  }\n\n  .flex-shrink-0\\@md {\n    flex-shrink: 0;\n  }\n\n  .flex-basis-0\\@md {\n    flex-basis: 0;\n  }\n\n  .justify-start\\@md {\n    justify-content: flex-start;\n  }\n\n  .justify-end\\@md {\n    justify-content: flex-end;\n  }\n\n  .justify-center\\@md {\n    justify-content: center;\n  }\n\n  .justify-between\\@md {\n    justify-content: space-between;\n  }\n\n  .items-center\\@md {\n    align-items: center;\n  }\n\n  .items-start\\@md {\n    align-items: flex-start;\n  }\n\n  .items-end\\@md {\n    align-items: flex-end;\n  }\n\n  .items-baseline\\@md {\n    align-items: baseline;\n  }\n\n  .order-1\\@md {\n    order: 1;\n  }\n\n  .order-2\\@md {\n    order: 2;\n  }\n\n  .order-3\\@md {\n    order: 3;\n  }\n\n  .block\\@md {\n    display: block;\n  }\n\n  .inline-block\\@md {\n    display: inline-block;\n  }\n\n  .inline\\@md {\n    display: inline;\n  }\n\n  @supports (--css: variables) {\n    .margin-xxxxs\\@md {\n      margin: var(--space-xxxxs);\n    }\n\n    .margin-xxxs\\@md {\n      margin: var(--space-xxxs);\n    }\n\n    .margin-xxs\\@md {\n      margin: var(--space-xxs);\n    }\n\n    .margin-xs\\@md {\n      margin: var(--space-xs);\n    }\n\n    .margin-sm\\@md {\n      margin: var(--space-sm);\n    }\n\n    .margin-md\\@md {\n      margin: var(--space-md);\n    }\n\n    .margin-lg\\@md {\n      margin: var(--space-lg);\n    }\n\n    .margin-xl\\@md {\n      margin: var(--space-xl);\n    }\n\n    .margin-xxl\\@md {\n      margin: var(--space-xxl);\n    }\n\n    .margin-xxxl\\@md {\n      margin: var(--space-xxxl);\n    }\n\n    .margin-xxxxl\\@md {\n      margin: var(--space-xxxxl);\n    }\n\n    .margin-auto\\@md {\n      margin: auto;\n    }\n\n    .margin-0\\@md {\n      margin: 0;\n    }\n\n    .margin-top-xxxxs\\@md {\n      margin-top: var(--space-xxxxs);\n    }\n\n    .margin-top-xxxs\\@md {\n      margin-top: var(--space-xxxs);\n    }\n\n    .margin-top-xxs\\@md {\n      margin-top: var(--space-xxs);\n    }\n\n    .margin-top-xs\\@md {\n      margin-top: var(--space-xs);\n    }\n\n    .margin-top-sm\\@md {\n      margin-top: var(--space-sm);\n    }\n\n    .margin-top-md\\@md {\n      margin-top: var(--space-md);\n    }\n\n    .margin-top-lg\\@md {\n      margin-top: var(--space-lg);\n    }\n\n    .margin-top-xl\\@md {\n      margin-top: var(--space-xl);\n    }\n\n    .margin-top-xxl\\@md {\n      margin-top: var(--space-xxl);\n    }\n\n    .margin-top-xxxl\\@md {\n      margin-top: var(--space-xxxl);\n    }\n\n    .margin-top-xxxxl\\@md {\n      margin-top: var(--space-xxxxl);\n    }\n\n    .margin-top-auto\\@md {\n      margin-top: auto;\n    }\n\n    .margin-top-0\\@md {\n      margin-top: 0;\n    }\n\n    .margin-bottom-xxxxs\\@md {\n      margin-bottom: var(--space-xxxxs);\n    }\n\n    .margin-bottom-xxxs\\@md {\n      margin-bottom: var(--space-xxxs);\n    }\n\n    .margin-bottom-xxs\\@md {\n      margin-bottom: var(--space-xxs);\n    }\n\n    .margin-bottom-xs\\@md {\n      margin-bottom: var(--space-xs);\n    }\n\n    .margin-bottom-sm\\@md {\n      margin-bottom: var(--space-sm);\n    }\n\n    .margin-bottom-md\\@md {\n      margin-bottom: var(--space-md);\n    }\n\n    .margin-bottom-lg\\@md {\n      margin-bottom: var(--space-lg);\n    }\n\n    .margin-bottom-xl\\@md {\n      margin-bottom: var(--space-xl);\n    }\n\n    .margin-bottom-xxl\\@md {\n      margin-bottom: var(--space-xxl);\n    }\n\n    .margin-bottom-xxxl\\@md {\n      margin-bottom: var(--space-xxxl);\n    }\n\n    .margin-bottom-xxxxl\\@md {\n      margin-bottom: var(--space-xxxxl);\n    }\n\n    .margin-bottom-auto\\@md {\n      margin-bottom: auto;\n    }\n\n    .margin-bottom-0\\@md {\n      margin-bottom: 0;\n    }\n\n    .margin-right-xxxxs\\@md {\n      margin-right: var(--space-xxxxs);\n    }\n\n    .margin-right-xxxs\\@md {\n      margin-right: var(--space-xxxs);\n    }\n\n    .margin-right-xxs\\@md {\n      margin-right: var(--space-xxs);\n    }\n\n    .margin-right-xs\\@md {\n      margin-right: var(--space-xs);\n    }\n\n    .margin-right-sm\\@md {\n      margin-right: var(--space-sm);\n    }\n\n    .margin-right-md\\@md {\n      margin-right: var(--space-md);\n    }\n\n    .margin-right-lg\\@md {\n      margin-right: var(--space-lg);\n    }\n\n    .margin-right-xl\\@md {\n      margin-right: var(--space-xl);\n    }\n\n    .margin-right-xxl\\@md {\n      margin-right: var(--space-xxl);\n    }\n\n    .margin-right-xxxl\\@md {\n      margin-right: var(--space-xxxl);\n    }\n\n    .margin-right-xxxxl\\@md {\n      margin-right: var(--space-xxxxl);\n    }\n\n    .margin-right-auto\\@md {\n      margin-right: auto;\n    }\n\n    .margin-right-0\\@md {\n      margin-right: 0;\n    }\n\n    .margin-left-xxxxs\\@md {\n      margin-left: var(--space-xxxxs);\n    }\n\n    .margin-left-xxxs\\@md {\n      margin-left: var(--space-xxxs);\n    }\n\n    .margin-left-xxs\\@md {\n      margin-left: var(--space-xxs);\n    }\n\n    .margin-left-xs\\@md {\n      margin-left: var(--space-xs);\n    }\n\n    .margin-left-sm\\@md {\n      margin-left: var(--space-sm);\n    }\n\n    .margin-left-md\\@md {\n      margin-left: var(--space-md);\n    }\n\n    .margin-left-lg\\@md {\n      margin-left: var(--space-lg);\n    }\n\n    .margin-left-xl\\@md {\n      margin-left: var(--space-xl);\n    }\n\n    .margin-left-xxl\\@md {\n      margin-left: var(--space-xxl);\n    }\n\n    .margin-left-xxxl\\@md {\n      margin-left: var(--space-xxxl);\n    }\n\n    .margin-left-xxxxl\\@md {\n      margin-left: var(--space-xxxxl);\n    }\n\n    .margin-left-auto\\@md {\n      margin-left: auto;\n    }\n\n    .margin-left-0\\@md {\n      margin-left: 0;\n    }\n\n    .margin-x-xxxxs\\@md {\n      margin-left: var(--space-xxxxs);\n      margin-right: var(--space-xxxxs);\n    }\n\n    .margin-x-xxxs\\@md {\n      margin-left: var(--space-xxxs);\n      margin-right: var(--space-xxxs);\n    }\n\n    .margin-x-xxs\\@md {\n      margin-left: var(--space-xxs);\n      margin-right: var(--space-xxs);\n    }\n\n    .margin-x-xs\\@md {\n      margin-left: var(--space-xs);\n      margin-right: var(--space-xs);\n    }\n\n    .margin-x-sm\\@md {\n      margin-left: var(--space-sm);\n      margin-right: var(--space-sm);\n    }\n\n    .margin-x-md\\@md {\n      margin-left: var(--space-md);\n      margin-right: var(--space-md);\n    }\n\n    .margin-x-lg\\@md {\n      margin-left: var(--space-lg);\n      margin-right: var(--space-lg);\n    }\n\n    .margin-x-xl\\@md {\n      margin-left: var(--space-xl);\n      margin-right: var(--space-xl);\n    }\n\n    .margin-x-xxl\\@md {\n      margin-left: var(--space-xxl);\n      margin-right: var(--space-xxl);\n    }\n\n    .margin-x-xxxl\\@md {\n      margin-left: var(--space-xxxl);\n      margin-right: var(--space-xxxl);\n    }\n\n    .margin-x-xxxxl\\@md {\n      margin-left: var(--space-xxxxl);\n      margin-right: var(--space-xxxxl);\n    }\n\n    .margin-x-auto\\@md {\n      margin-left: auto;\n      margin-right: auto;\n    }\n\n    .margin-x-0\\@md {\n      margin-left: 0;\n      margin-right: 0;\n    }\n\n    .margin-y-xxxxs\\@md {\n      margin-top: var(--space-xxxxs);\n      margin-bottom: var(--space-xxxxs);\n    }\n\n    .margin-y-xxxs\\@md {\n      margin-top: var(--space-xxxs);\n      margin-bottom: var(--space-xxxs);\n    }\n\n    .margin-y-xxs\\@md {\n      margin-top: var(--space-xxs);\n      margin-bottom: var(--space-xxs);\n    }\n\n    .margin-y-xs\\@md {\n      margin-top: var(--space-xs);\n      margin-bottom: var(--space-xs);\n    }\n\n    .margin-y-sm\\@md {\n      margin-top: var(--space-sm);\n      margin-bottom: var(--space-sm);\n    }\n\n    .margin-y-md\\@md {\n      margin-top: var(--space-md);\n      margin-bottom: var(--space-md);\n    }\n\n    .margin-y-lg\\@md {\n      margin-top: var(--space-lg);\n      margin-bottom: var(--space-lg);\n    }\n\n    .margin-y-xl\\@md {\n      margin-top: var(--space-xl);\n      margin-bottom: var(--space-xl);\n    }\n\n    .margin-y-xxl\\@md {\n      margin-top: var(--space-xxl);\n      margin-bottom: var(--space-xxl);\n    }\n\n    .margin-y-xxxl\\@md {\n      margin-top: var(--space-xxxl);\n      margin-bottom: var(--space-xxxl);\n    }\n\n    .margin-y-xxxxl\\@md {\n      margin-top: var(--space-xxxxl);\n      margin-bottom: var(--space-xxxxl);\n    }\n\n    .margin-y-auto\\@md {\n      margin-top: auto;\n      margin-bottom: auto;\n    }\n\n    .margin-y-0\\@md {\n      margin-top: 0;\n      margin-bottom: 0;\n    }\n  }\n  @supports (--css: variables) {\n    .padding-xxxxs\\@md {\n      padding: var(--space-xxxxs);\n    }\n\n    .padding-xxxs\\@md {\n      padding: var(--space-xxxs);\n    }\n\n    .padding-xxs\\@md {\n      padding: var(--space-xxs);\n    }\n\n    .padding-xs\\@md {\n      padding: var(--space-xs);\n    }\n\n    .padding-sm\\@md {\n      padding: var(--space-sm);\n    }\n\n    .padding-md\\@md {\n      padding: var(--space-md);\n    }\n\n    .padding-lg\\@md {\n      padding: var(--space-lg);\n    }\n\n    .padding-xl\\@md {\n      padding: var(--space-xl);\n    }\n\n    .padding-xxl\\@md {\n      padding: var(--space-xxl);\n    }\n\n    .padding-xxxl\\@md {\n      padding: var(--space-xxxl);\n    }\n\n    .padding-xxxxl\\@md {\n      padding: var(--space-xxxxl);\n    }\n\n    .padding-0\\@md {\n      padding: 0;\n    }\n\n    .padding-component\\@md {\n      padding: var(--component-padding);\n    }\n\n    .padding-top-xxxxs\\@md {\n      padding-top: var(--space-xxxxs);\n    }\n\n    .padding-top-xxxs\\@md {\n      padding-top: var(--space-xxxs);\n    }\n\n    .padding-top-xxs\\@md {\n      padding-top: var(--space-xxs);\n    }\n\n    .padding-top-xs\\@md {\n      padding-top: var(--space-xs);\n    }\n\n    .padding-top-sm\\@md {\n      padding-top: var(--space-sm);\n    }\n\n    .padding-top-md\\@md {\n      padding-top: var(--space-md);\n    }\n\n    .padding-top-lg\\@md {\n      padding-top: var(--space-lg);\n    }\n\n    .padding-top-xl\\@md {\n      padding-top: var(--space-xl);\n    }\n\n    .padding-top-xxl\\@md {\n      padding-top: var(--space-xxl);\n    }\n\n    .padding-top-xxxl\\@md {\n      padding-top: var(--space-xxxl);\n    }\n\n    .padding-top-xxxxl\\@md {\n      padding-top: var(--space-xxxxl);\n    }\n\n    .padding-top-0\\@md {\n      padding-top: 0;\n    }\n\n    .padding-top-component\\@md {\n      padding-top: var(--component-padding);\n    }\n\n    .padding-bottom-xxxxs\\@md {\n      padding-bottom: var(--space-xxxxs);\n    }\n\n    .padding-bottom-xxxs\\@md {\n      padding-bottom: var(--space-xxxs);\n    }\n\n    .padding-bottom-xxs\\@md {\n      padding-bottom: var(--space-xxs);\n    }\n\n    .padding-bottom-xs\\@md {\n      padding-bottom: var(--space-xs);\n    }\n\n    .padding-bottom-sm\\@md {\n      padding-bottom: var(--space-sm);\n    }\n\n    .padding-bottom-md\\@md {\n      padding-bottom: var(--space-md);\n    }\n\n    .padding-bottom-lg\\@md {\n      padding-bottom: var(--space-lg);\n    }\n\n    .padding-bottom-xl\\@md {\n      padding-bottom: var(--space-xl);\n    }\n\n    .padding-bottom-xxl\\@md {\n      padding-bottom: var(--space-xxl);\n    }\n\n    .padding-bottom-xxxl\\@md {\n      padding-bottom: var(--space-xxxl);\n    }\n\n    .padding-bottom-xxxxl\\@md {\n      padding-bottom: var(--space-xxxxl);\n    }\n\n    .padding-bottom-0\\@md {\n      padding-bottom: 0;\n    }\n\n    .padding-bottom-component\\@md {\n      padding-bottom: var(--component-padding);\n    }\n\n    .padding-right-xxxxs\\@md {\n      padding-right: var(--space-xxxxs);\n    }\n\n    .padding-right-xxxs\\@md {\n      padding-right: var(--space-xxxs);\n    }\n\n    .padding-right-xxs\\@md {\n      padding-right: var(--space-xxs);\n    }\n\n    .padding-right-xs\\@md {\n      padding-right: var(--space-xs);\n    }\n\n    .padding-right-sm\\@md {\n      padding-right: var(--space-sm);\n    }\n\n    .padding-right-md\\@md {\n      padding-right: var(--space-md);\n    }\n\n    .padding-right-lg\\@md {\n      padding-right: var(--space-lg);\n    }\n\n    .padding-right-xl\\@md {\n      padding-right: var(--space-xl);\n    }\n\n    .padding-right-xxl\\@md {\n      padding-right: var(--space-xxl);\n    }\n\n    .padding-right-xxxl\\@md {\n      padding-right: var(--space-xxxl);\n    }\n\n    .padding-right-xxxxl\\@md {\n      padding-right: var(--space-xxxxl);\n    }\n\n    .padding-right-0\\@md {\n      padding-right: 0;\n    }\n\n    .padding-right-component\\@md {\n      padding-right: var(--component-padding);\n    }\n\n    .padding-left-xxxxs\\@md {\n      padding-left: var(--space-xxxxs);\n    }\n\n    .padding-left-xxxs\\@md {\n      padding-left: var(--space-xxxs);\n    }\n\n    .padding-left-xxs\\@md {\n      padding-left: var(--space-xxs);\n    }\n\n    .padding-left-xs\\@md {\n      padding-left: var(--space-xs);\n    }\n\n    .padding-left-sm\\@md {\n      padding-left: var(--space-sm);\n    }\n\n    .padding-left-md\\@md {\n      padding-left: var(--space-md);\n    }\n\n    .padding-left-lg\\@md {\n      padding-left: var(--space-lg);\n    }\n\n    .padding-left-xl\\@md {\n      padding-left: var(--space-xl);\n    }\n\n    .padding-left-xxl\\@md {\n      padding-left: var(--space-xxl);\n    }\n\n    .padding-left-xxxl\\@md {\n      padding-left: var(--space-xxxl);\n    }\n\n    .padding-left-xxxxl\\@md {\n      padding-left: var(--space-xxxxl);\n    }\n\n    .padding-left-0\\@md {\n      padding-left: 0;\n    }\n\n    .padding-left-component\\@md {\n      padding-left: var(--component-padding);\n    }\n\n    .padding-x-xxxxs\\@md {\n      padding-left: var(--space-xxxxs);\n      padding-right: var(--space-xxxxs);\n    }\n\n    .padding-x-xxxs\\@md {\n      padding-left: var(--space-xxxs);\n      padding-right: var(--space-xxxs);\n    }\n\n    .padding-x-xxs\\@md {\n      padding-left: var(--space-xxs);\n      padding-right: var(--space-xxs);\n    }\n\n    .padding-x-xs\\@md {\n      padding-left: var(--space-xs);\n      padding-right: var(--space-xs);\n    }\n\n    .padding-x-sm\\@md {\n      padding-left: var(--space-sm);\n      padding-right: var(--space-sm);\n    }\n\n    .padding-x-md\\@md {\n      padding-left: var(--space-md);\n      padding-right: var(--space-md);\n    }\n\n    .padding-x-lg\\@md {\n      padding-left: var(--space-lg);\n      padding-right: var(--space-lg);\n    }\n\n    .padding-x-xl\\@md {\n      padding-left: var(--space-xl);\n      padding-right: var(--space-xl);\n    }\n\n    .padding-x-xxl\\@md {\n      padding-left: var(--space-xxl);\n      padding-right: var(--space-xxl);\n    }\n\n    .padding-x-xxxl\\@md {\n      padding-left: var(--space-xxxl);\n      padding-right: var(--space-xxxl);\n    }\n\n    .padding-x-xxxxl\\@md {\n      padding-left: var(--space-xxxxl);\n      padding-right: var(--space-xxxxl);\n    }\n\n    .padding-x-0\\@md {\n      padding-left: 0;\n      padding-right: 0;\n    }\n\n    .padding-x-component\\@md {\n      padding-left: var(--component-padding);\n      padding-right: var(--component-padding);\n    }\n\n    .padding-y-xxxxs\\@md {\n      padding-top: var(--space-xxxxs);\n      padding-bottom: var(--space-xxxxs);\n    }\n\n    .padding-y-xxxs\\@md {\n      padding-top: var(--space-xxxs);\n      padding-bottom: var(--space-xxxs);\n    }\n\n    .padding-y-xxs\\@md {\n      padding-top: var(--space-xxs);\n      padding-bottom: var(--space-xxs);\n    }\n\n    .padding-y-xs\\@md {\n      padding-top: var(--space-xs);\n      padding-bottom: var(--space-xs);\n    }\n\n    .padding-y-sm\\@md {\n      padding-top: var(--space-sm);\n      padding-bottom: var(--space-sm);\n    }\n\n    .padding-y-md\\@md {\n      padding-top: var(--space-md);\n      padding-bottom: var(--space-md);\n    }\n\n    .padding-y-lg\\@md {\n      padding-top: var(--space-lg);\n      padding-bottom: var(--space-lg);\n    }\n\n    .padding-y-xl\\@md {\n      padding-top: var(--space-xl);\n      padding-bottom: var(--space-xl);\n    }\n\n    .padding-y-xxl\\@md {\n      padding-top: var(--space-xxl);\n      padding-bottom: var(--space-xxl);\n    }\n\n    .padding-y-xxxl\\@md {\n      padding-top: var(--space-xxxl);\n      padding-bottom: var(--space-xxxl);\n    }\n\n    .padding-y-xxxxl\\@md {\n      padding-top: var(--space-xxxxl);\n      padding-bottom: var(--space-xxxxl);\n    }\n\n    .padding-y-0\\@md {\n      padding-top: 0;\n      padding-bottom: 0;\n    }\n\n    .padding-y-component\\@md {\n      padding-top: var(--component-padding);\n      padding-bottom: var(--component-padding);\n    }\n  }\n  .text-center\\@md {\n    text-align: center;\n  }\n\n  .text-left\\@md {\n    text-align: left;\n  }\n\n  .text-right\\@md {\n    text-align: right;\n  }\n\n  .text-justify\\@md {\n    text-align: justify;\n  }\n\n  @supports (--css: variables) {\n    .text-xs\\@md {\n      font-size: var(--text-xs, 0.694em);\n    }\n\n    .text-sm\\@md {\n      font-size: var(--text-sm, 0.833em);\n    }\n\n    .text-base\\@md {\n      font-size: var(--text-unit, 1em);\n    }\n\n    .text-md\\@md {\n      font-size: var(--text-md, 1.2em);\n    }\n\n    .text-lg\\@md {\n      font-size: var(--text-lg, 1.44em);\n    }\n\n    .text-xl\\@md {\n      font-size: var(--text-xl, 1.728em);\n    }\n\n    .text-xxl\\@md {\n      font-size: var(--text-xxl, 2.074em);\n    }\n\n    .text-xxxl\\@md {\n      font-size: var(--text-xxxl, 2.488em);\n    }\n\n    .text-xxxxl\\@md {\n      font-size: var(--text-xxxxl, 2.985em);\n    }\n  }\n  @supports (--css: variables) {\n    .width-xxxxs\\@md {\n      width: var(--size-xxxxs, 0.25rem);\n    }\n\n    .width-xxxs\\@md {\n      width: var(--size-xxxs, 0.5rem);\n    }\n\n    .width-xxs\\@md {\n      width: var(--size-xxs, 0.75rem);\n    }\n\n    .width-xs\\@md {\n      width: var(--size-xs, 1rem);\n    }\n\n    .width-sm\\@md {\n      width: var(--size-sm, 1.5rem);\n    }\n\n    .width-md\\@md {\n      width: var(--size-md, 2rem);\n    }\n\n    .width-lg\\@md {\n      width: var(--size-lg, 3rem);\n    }\n\n    .width-xl\\@md {\n      width: var(--size-xl, 4rem);\n    }\n\n    .width-xxl\\@md {\n      width: var(--size-xxl, 6rem);\n    }\n\n    .width-xxxl\\@md {\n      width: var(--size-xxxl, 8rem);\n    }\n\n    .width-xxxxl\\@md {\n      width: var(--size-xxxxl, 16rem);\n    }\n  }\n  .width-0\\@md {\n    width: 0;\n  }\n\n  .width-10\\%\\@md {\n    width: 10%;\n  }\n\n  .width-20\\%\\@md {\n    width: 20%;\n  }\n\n  .width-25\\%\\@md {\n    width: 25%;\n  }\n\n  .width-30\\%\\@md {\n    width: 30%;\n  }\n\n  .width-33\\%\\@md {\n    width: calc(100% / 3);\n  }\n\n  .width-40\\%\\@md {\n    width: 40%;\n  }\n\n  .width-50\\%\\@md {\n    width: 50%;\n  }\n\n  .width-60\\%\\@md {\n    width: 60%;\n  }\n\n  .width-66\\%\\@md {\n    width: calc(100% / 1.5);\n  }\n\n  .width-70\\%\\@md {\n    width: 70%;\n  }\n\n  .width-75\\%\\@md {\n    width: 75%;\n  }\n\n  .width-80\\%\\@md {\n    width: 80%;\n  }\n\n  .width-90\\%\\@md {\n    width: 90%;\n  }\n\n  .width-100\\%\\@md {\n    width: 100%;\n  }\n\n  .width-100vw\\@md {\n    width: 100vw;\n  }\n\n  .width-auto\\@md {\n    width: auto;\n  }\n\n  @supports (--css: variables) {\n    .height-xxxxs\\@md {\n      height: var(--size-xxxxs, 0.25rem);\n    }\n\n    .height-xxxs\\@md {\n      height: var(--size-xxxs, 0.5rem);\n    }\n\n    .height-xxs\\@md {\n      height: var(--size-xxs, 0.75rem);\n    }\n\n    .height-xs\\@md {\n      height: var(--size-xs, 1rem);\n    }\n\n    .height-sm\\@md {\n      height: var(--size-sm, 1.5rem);\n    }\n\n    .height-md\\@md {\n      height: var(--size-md, 2rem);\n    }\n\n    .height-lg\\@md {\n      height: var(--size-lg, 3rem);\n    }\n\n    .height-xl\\@md {\n      height: var(--size-xl, 4rem);\n    }\n\n    .height-xxl\\@md {\n      height: var(--size-xxl, 6rem);\n    }\n\n    .height-xxxl\\@md {\n      height: var(--size-xxxl, 8rem);\n    }\n\n    .height-xxxxl\\@md {\n      height: var(--size-xxxxl, 16rem);\n    }\n  }\n  .height-0\\@md {\n    height: 0;\n  }\n\n  .height-10\\%\\@md {\n    height: 10%;\n  }\n\n  .height-20\\%\\@md {\n    height: 20%;\n  }\n\n  .height-25\\%\\@md {\n    height: 25%;\n  }\n\n  .height-30\\%\\@md {\n    height: 30%;\n  }\n\n  .height-33\\%\\@md {\n    height: calc(100% / 3);\n  }\n\n  .height-40\\%\\@md {\n    height: 40%;\n  }\n\n  .height-50\\%\\@md {\n    height: 50%;\n  }\n\n  .height-60\\%\\@md {\n    height: 60%;\n  }\n\n  .height-66\\%\\@md {\n    height: calc(100% / 1.5);\n  }\n\n  .height-70\\%\\@md {\n    height: 70%;\n  }\n\n  .height-75\\%\\@md {\n    height: 75%;\n  }\n\n  .height-80\\%\\@md {\n    height: 80%;\n  }\n\n  .height-90\\%\\@md {\n    height: 90%;\n  }\n\n  .height-100\\%\\@md {\n    height: 100%;\n  }\n\n  .height-100vh\\@md {\n    height: 100vh;\n  }\n\n  .height-auto\\@md {\n    height: auto;\n  }\n\n  .position-relative\\@md {\n    position: relative;\n  }\n\n  .position-absolute\\@md {\n    position: absolute;\n  }\n\n  .position-fixed\\@md {\n    position: fixed;\n  }\n\n  .position-sticky\\@md {\n    position: sticky;\n  }\n\n  .position-static\\@md {\n    position: static;\n  }\n\n  .top-0\\@md {\n    top: 0;\n  }\n\n  .top-50\\%\\@md {\n    top: 50%;\n  }\n\n  .bottom-0\\@md {\n    bottom: 0;\n  }\n\n  .bottom-50\\%\\@md {\n    bottom: 50%;\n  }\n\n  .left-0\\@md {\n    left: 0;\n  }\n\n  .left-50\\%\\@md {\n    left: 50%;\n  }\n\n  .right-0\\@md {\n    right: 0;\n  }\n\n  .right-50\\%\\@md {\n    right: 50%;\n  }\n\n  .inset-0\\@md {\n    top: 0;\n    right: 0;\n    bottom: 0;\n    left: 0;\n  }\n\n  .hide\\@md {\n    display: none !important;\n  }\n}\n@media not all and (min-width: 64rem) {\n  .has-margin\\@md {\n    margin: 0 !important;\n  }\n\n  .has-padding\\@md {\n    padding: 0 !important;\n  }\n\n  .display\\@md {\n    display: none !important;\n  }\n}\n@media (min-width: 80rem) {\n  .flex\\@lg {\n    display: flex;\n  }\n\n  .inline-flex\\@lg {\n    display: inline-flex;\n  }\n\n  .flex-wrap\\@lg {\n    flex-wrap: wrap;\n  }\n\n  .flex-column\\@lg {\n    flex-direction: column;\n  }\n\n  .flex-column-reverse\\@lg {\n    flex-direction: column-reverse;\n  }\n\n  .flex-row\\@lg {\n    flex-direction: row;\n  }\n\n  .flex-row-reverse\\@lg {\n    flex-direction: row-reverse;\n  }\n\n  .flex-center\\@lg {\n    justify-content: center;\n    align-items: center;\n  }\n\n  .flex-grow\\@lg {\n    flex-grow: 1;\n  }\n\n  .flex-grow-0\\@lg {\n    flex-grow: 0;\n  }\n\n  .flex-shrink\\@lg {\n    flex-shrink: 1;\n  }\n\n  .flex-shrink-0\\@lg {\n    flex-shrink: 0;\n  }\n\n  .flex-basis-0\\@lg {\n    flex-basis: 0;\n  }\n\n  .justify-start\\@lg {\n    justify-content: flex-start;\n  }\n\n  .justify-end\\@lg {\n    justify-content: flex-end;\n  }\n\n  .justify-center\\@lg {\n    justify-content: center;\n  }\n\n  .justify-between\\@lg {\n    justify-content: space-between;\n  }\n\n  .items-center\\@lg {\n    align-items: center;\n  }\n\n  .items-start\\@lg {\n    align-items: flex-start;\n  }\n\n  .items-end\\@lg {\n    align-items: flex-end;\n  }\n\n  .items-baseline\\@lg {\n    align-items: baseline;\n  }\n\n  .order-1\\@lg {\n    order: 1;\n  }\n\n  .order-2\\@lg {\n    order: 2;\n  }\n\n  .order-3\\@lg {\n    order: 3;\n  }\n\n  .block\\@lg {\n    display: block;\n  }\n\n  .inline-block\\@lg {\n    display: inline-block;\n  }\n\n  .inline\\@lg {\n    display: inline;\n  }\n\n  @supports (--css: variables) {\n    .margin-xxxxs\\@lg {\n      margin: var(--space-xxxxs);\n    }\n\n    .margin-xxxs\\@lg {\n      margin: var(--space-xxxs);\n    }\n\n    .margin-xxs\\@lg {\n      margin: var(--space-xxs);\n    }\n\n    .margin-xs\\@lg {\n      margin: var(--space-xs);\n    }\n\n    .margin-sm\\@lg {\n      margin: var(--space-sm);\n    }\n\n    .margin-md\\@lg {\n      margin: var(--space-md);\n    }\n\n    .margin-lg\\@lg {\n      margin: var(--space-lg);\n    }\n\n    .margin-xl\\@lg {\n      margin: var(--space-xl);\n    }\n\n    .margin-xxl\\@lg {\n      margin: var(--space-xxl);\n    }\n\n    .margin-xxxl\\@lg {\n      margin: var(--space-xxxl);\n    }\n\n    .margin-xxxxl\\@lg {\n      margin: var(--space-xxxxl);\n    }\n\n    .margin-auto\\@lg {\n      margin: auto;\n    }\n\n    .margin-0\\@lg {\n      margin: 0;\n    }\n\n    .margin-top-xxxxs\\@lg {\n      margin-top: var(--space-xxxxs);\n    }\n\n    .margin-top-xxxs\\@lg {\n      margin-top: var(--space-xxxs);\n    }\n\n    .margin-top-xxs\\@lg {\n      margin-top: var(--space-xxs);\n    }\n\n    .margin-top-xs\\@lg {\n      margin-top: var(--space-xs);\n    }\n\n    .margin-top-sm\\@lg {\n      margin-top: var(--space-sm);\n    }\n\n    .margin-top-md\\@lg {\n      margin-top: var(--space-md);\n    }\n\n    .margin-top-lg\\@lg {\n      margin-top: var(--space-lg);\n    }\n\n    .margin-top-xl\\@lg {\n      margin-top: var(--space-xl);\n    }\n\n    .margin-top-xxl\\@lg {\n      margin-top: var(--space-xxl);\n    }\n\n    .margin-top-xxxl\\@lg {\n      margin-top: var(--space-xxxl);\n    }\n\n    .margin-top-xxxxl\\@lg {\n      margin-top: var(--space-xxxxl);\n    }\n\n    .margin-top-auto\\@lg {\n      margin-top: auto;\n    }\n\n    .margin-top-0\\@lg {\n      margin-top: 0;\n    }\n\n    .margin-bottom-xxxxs\\@lg {\n      margin-bottom: var(--space-xxxxs);\n    }\n\n    .margin-bottom-xxxs\\@lg {\n      margin-bottom: var(--space-xxxs);\n    }\n\n    .margin-bottom-xxs\\@lg {\n      margin-bottom: var(--space-xxs);\n    }\n\n    .margin-bottom-xs\\@lg {\n      margin-bottom: var(--space-xs);\n    }\n\n    .margin-bottom-sm\\@lg {\n      margin-bottom: var(--space-sm);\n    }\n\n    .margin-bottom-md\\@lg {\n      margin-bottom: var(--space-md);\n    }\n\n    .margin-bottom-lg\\@lg {\n      margin-bottom: var(--space-lg);\n    }\n\n    .margin-bottom-xl\\@lg {\n      margin-bottom: var(--space-xl);\n    }\n\n    .margin-bottom-xxl\\@lg {\n      margin-bottom: var(--space-xxl);\n    }\n\n    .margin-bottom-xxxl\\@lg {\n      margin-bottom: var(--space-xxxl);\n    }\n\n    .margin-bottom-xxxxl\\@lg {\n      margin-bottom: var(--space-xxxxl);\n    }\n\n    .margin-bottom-auto\\@lg {\n      margin-bottom: auto;\n    }\n\n    .margin-bottom-0\\@lg {\n      margin-bottom: 0;\n    }\n\n    .margin-right-xxxxs\\@lg {\n      margin-right: var(--space-xxxxs);\n    }\n\n    .margin-right-xxxs\\@lg {\n      margin-right: var(--space-xxxs);\n    }\n\n    .margin-right-xxs\\@lg {\n      margin-right: var(--space-xxs);\n    }\n\n    .margin-right-xs\\@lg {\n      margin-right: var(--space-xs);\n    }\n\n    .margin-right-sm\\@lg {\n      margin-right: var(--space-sm);\n    }\n\n    .margin-right-md\\@lg {\n      margin-right: var(--space-md);\n    }\n\n    .margin-right-lg\\@lg {\n      margin-right: var(--space-lg);\n    }\n\n    .margin-right-xl\\@lg {\n      margin-right: var(--space-xl);\n    }\n\n    .margin-right-xxl\\@lg {\n      margin-right: var(--space-xxl);\n    }\n\n    .margin-right-xxxl\\@lg {\n      margin-right: var(--space-xxxl);\n    }\n\n    .margin-right-xxxxl\\@lg {\n      margin-right: var(--space-xxxxl);\n    }\n\n    .margin-right-auto\\@lg {\n      margin-right: auto;\n    }\n\n    .margin-right-0\\@lg {\n      margin-right: 0;\n    }\n\n    .margin-left-xxxxs\\@lg {\n      margin-left: var(--space-xxxxs);\n    }\n\n    .margin-left-xxxs\\@lg {\n      margin-left: var(--space-xxxs);\n    }\n\n    .margin-left-xxs\\@lg {\n      margin-left: var(--space-xxs);\n    }\n\n    .margin-left-xs\\@lg {\n      margin-left: var(--space-xs);\n    }\n\n    .margin-left-sm\\@lg {\n      margin-left: var(--space-sm);\n    }\n\n    .margin-left-md\\@lg {\n      margin-left: var(--space-md);\n    }\n\n    .margin-left-lg\\@lg {\n      margin-left: var(--space-lg);\n    }\n\n    .margin-left-xl\\@lg {\n      margin-left: var(--space-xl);\n    }\n\n    .margin-left-xxl\\@lg {\n      margin-left: var(--space-xxl);\n    }\n\n    .margin-left-xxxl\\@lg {\n      margin-left: var(--space-xxxl);\n    }\n\n    .margin-left-xxxxl\\@lg {\n      margin-left: var(--space-xxxxl);\n    }\n\n    .margin-left-auto\\@lg {\n      margin-left: auto;\n    }\n\n    .margin-left-0\\@lg {\n      margin-left: 0;\n    }\n\n    .margin-x-xxxxs\\@lg {\n      margin-left: var(--space-xxxxs);\n      margin-right: var(--space-xxxxs);\n    }\n\n    .margin-x-xxxs\\@lg {\n      margin-left: var(--space-xxxs);\n      margin-right: var(--space-xxxs);\n    }\n\n    .margin-x-xxs\\@lg {\n      margin-left: var(--space-xxs);\n      margin-right: var(--space-xxs);\n    }\n\n    .margin-x-xs\\@lg {\n      margin-left: var(--space-xs);\n      margin-right: var(--space-xs);\n    }\n\n    .margin-x-sm\\@lg {\n      margin-left: var(--space-sm);\n      margin-right: var(--space-sm);\n    }\n\n    .margin-x-md\\@lg {\n      margin-left: var(--space-md);\n      margin-right: var(--space-md);\n    }\n\n    .margin-x-lg\\@lg {\n      margin-left: var(--space-lg);\n      margin-right: var(--space-lg);\n    }\n\n    .margin-x-xl\\@lg {\n      margin-left: var(--space-xl);\n      margin-right: var(--space-xl);\n    }\n\n    .margin-x-xxl\\@lg {\n      margin-left: var(--space-xxl);\n      margin-right: var(--space-xxl);\n    }\n\n    .margin-x-xxxl\\@lg {\n      margin-left: var(--space-xxxl);\n      margin-right: var(--space-xxxl);\n    }\n\n    .margin-x-xxxxl\\@lg {\n      margin-left: var(--space-xxxxl);\n      margin-right: var(--space-xxxxl);\n    }\n\n    .margin-x-auto\\@lg {\n      margin-left: auto;\n      margin-right: auto;\n    }\n\n    .margin-x-0\\@lg {\n      margin-left: 0;\n      margin-right: 0;\n    }\n\n    .margin-y-xxxxs\\@lg {\n      margin-top: var(--space-xxxxs);\n      margin-bottom: var(--space-xxxxs);\n    }\n\n    .margin-y-xxxs\\@lg {\n      margin-top: var(--space-xxxs);\n      margin-bottom: var(--space-xxxs);\n    }\n\n    .margin-y-xxs\\@lg {\n      margin-top: var(--space-xxs);\n      margin-bottom: var(--space-xxs);\n    }\n\n    .margin-y-xs\\@lg {\n      margin-top: var(--space-xs);\n      margin-bottom: var(--space-xs);\n    }\n\n    .margin-y-sm\\@lg {\n      margin-top: var(--space-sm);\n      margin-bottom: var(--space-sm);\n    }\n\n    .margin-y-md\\@lg {\n      margin-top: var(--space-md);\n      margin-bottom: var(--space-md);\n    }\n\n    .margin-y-lg\\@lg {\n      margin-top: var(--space-lg);\n      margin-bottom: var(--space-lg);\n    }\n\n    .margin-y-xl\\@lg {\n      margin-top: var(--space-xl);\n      margin-bottom: var(--space-xl);\n    }\n\n    .margin-y-xxl\\@lg {\n      margin-top: var(--space-xxl);\n      margin-bottom: var(--space-xxl);\n    }\n\n    .margin-y-xxxl\\@lg {\n      margin-top: var(--space-xxxl);\n      margin-bottom: var(--space-xxxl);\n    }\n\n    .margin-y-xxxxl\\@lg {\n      margin-top: var(--space-xxxxl);\n      margin-bottom: var(--space-xxxxl);\n    }\n\n    .margin-y-auto\\@lg {\n      margin-top: auto;\n      margin-bottom: auto;\n    }\n\n    .margin-y-0\\@lg {\n      margin-top: 0;\n      margin-bottom: 0;\n    }\n  }\n  @supports (--css: variables) {\n    .padding-xxxxs\\@lg {\n      padding: var(--space-xxxxs);\n    }\n\n    .padding-xxxs\\@lg {\n      padding: var(--space-xxxs);\n    }\n\n    .padding-xxs\\@lg {\n      padding: var(--space-xxs);\n    }\n\n    .padding-xs\\@lg {\n      padding: var(--space-xs);\n    }\n\n    .padding-sm\\@lg {\n      padding: var(--space-sm);\n    }\n\n    .padding-md\\@lg {\n      padding: var(--space-md);\n    }\n\n    .padding-lg\\@lg {\n      padding: var(--space-lg);\n    }\n\n    .padding-xl\\@lg {\n      padding: var(--space-xl);\n    }\n\n    .padding-xxl\\@lg {\n      padding: var(--space-xxl);\n    }\n\n    .padding-xxxl\\@lg {\n      padding: var(--space-xxxl);\n    }\n\n    .padding-xxxxl\\@lg {\n      padding: var(--space-xxxxl);\n    }\n\n    .padding-0\\@lg {\n      padding: 0;\n    }\n\n    .padding-component\\@lg {\n      padding: var(--component-padding);\n    }\n\n    .padding-top-xxxxs\\@lg {\n      padding-top: var(--space-xxxxs);\n    }\n\n    .padding-top-xxxs\\@lg {\n      padding-top: var(--space-xxxs);\n    }\n\n    .padding-top-xxs\\@lg {\n      padding-top: var(--space-xxs);\n    }\n\n    .padding-top-xs\\@lg {\n      padding-top: var(--space-xs);\n    }\n\n    .padding-top-sm\\@lg {\n      padding-top: var(--space-sm);\n    }\n\n    .padding-top-md\\@lg {\n      padding-top: var(--space-md);\n    }\n\n    .padding-top-lg\\@lg {\n      padding-top: var(--space-lg);\n    }\n\n    .padding-top-xl\\@lg {\n      padding-top: var(--space-xl);\n    }\n\n    .padding-top-xxl\\@lg {\n      padding-top: var(--space-xxl);\n    }\n\n    .padding-top-xxxl\\@lg {\n      padding-top: var(--space-xxxl);\n    }\n\n    .padding-top-xxxxl\\@lg {\n      padding-top: var(--space-xxxxl);\n    }\n\n    .padding-top-0\\@lg {\n      padding-top: 0;\n    }\n\n    .padding-top-component\\@lg {\n      padding-top: var(--component-padding);\n    }\n\n    .padding-bottom-xxxxs\\@lg {\n      padding-bottom: var(--space-xxxxs);\n    }\n\n    .padding-bottom-xxxs\\@lg {\n      padding-bottom: var(--space-xxxs);\n    }\n\n    .padding-bottom-xxs\\@lg {\n      padding-bottom: var(--space-xxs);\n    }\n\n    .padding-bottom-xs\\@lg {\n      padding-bottom: var(--space-xs);\n    }\n\n    .padding-bottom-sm\\@lg {\n      padding-bottom: var(--space-sm);\n    }\n\n    .padding-bottom-md\\@lg {\n      padding-bottom: var(--space-md);\n    }\n\n    .padding-bottom-lg\\@lg {\n      padding-bottom: var(--space-lg);\n    }\n\n    .padding-bottom-xl\\@lg {\n      padding-bottom: var(--space-xl);\n    }\n\n    .padding-bottom-xxl\\@lg {\n      padding-bottom: var(--space-xxl);\n    }\n\n    .padding-bottom-xxxl\\@lg {\n      padding-bottom: var(--space-xxxl);\n    }\n\n    .padding-bottom-xxxxl\\@lg {\n      padding-bottom: var(--space-xxxxl);\n    }\n\n    .padding-bottom-0\\@lg {\n      padding-bottom: 0;\n    }\n\n    .padding-bottom-component\\@lg {\n      padding-bottom: var(--component-padding);\n    }\n\n    .padding-right-xxxxs\\@lg {\n      padding-right: var(--space-xxxxs);\n    }\n\n    .padding-right-xxxs\\@lg {\n      padding-right: var(--space-xxxs);\n    }\n\n    .padding-right-xxs\\@lg {\n      padding-right: var(--space-xxs);\n    }\n\n    .padding-right-xs\\@lg {\n      padding-right: var(--space-xs);\n    }\n\n    .padding-right-sm\\@lg {\n      padding-right: var(--space-sm);\n    }\n\n    .padding-right-md\\@lg {\n      padding-right: var(--space-md);\n    }\n\n    .padding-right-lg\\@lg {\n      padding-right: var(--space-lg);\n    }\n\n    .padding-right-xl\\@lg {\n      padding-right: var(--space-xl);\n    }\n\n    .padding-right-xxl\\@lg {\n      padding-right: var(--space-xxl);\n    }\n\n    .padding-right-xxxl\\@lg {\n      padding-right: var(--space-xxxl);\n    }\n\n    .padding-right-xxxxl\\@lg {\n      padding-right: var(--space-xxxxl);\n    }\n\n    .padding-right-0\\@lg {\n      padding-right: 0;\n    }\n\n    .padding-right-component\\@lg {\n      padding-right: var(--component-padding);\n    }\n\n    .padding-left-xxxxs\\@lg {\n      padding-left: var(--space-xxxxs);\n    }\n\n    .padding-left-xxxs\\@lg {\n      padding-left: var(--space-xxxs);\n    }\n\n    .padding-left-xxs\\@lg {\n      padding-left: var(--space-xxs);\n    }\n\n    .padding-left-xs\\@lg {\n      padding-left: var(--space-xs);\n    }\n\n    .padding-left-sm\\@lg {\n      padding-left: var(--space-sm);\n    }\n\n    .padding-left-md\\@lg {\n      padding-left: var(--space-md);\n    }\n\n    .padding-left-lg\\@lg {\n      padding-left: var(--space-lg);\n    }\n\n    .padding-left-xl\\@lg {\n      padding-left: var(--space-xl);\n    }\n\n    .padding-left-xxl\\@lg {\n      padding-left: var(--space-xxl);\n    }\n\n    .padding-left-xxxl\\@lg {\n      padding-left: var(--space-xxxl);\n    }\n\n    .padding-left-xxxxl\\@lg {\n      padding-left: var(--space-xxxxl);\n    }\n\n    .padding-left-0\\@lg {\n      padding-left: 0;\n    }\n\n    .padding-left-component\\@lg {\n      padding-left: var(--component-padding);\n    }\n\n    .padding-x-xxxxs\\@lg {\n      padding-left: var(--space-xxxxs);\n      padding-right: var(--space-xxxxs);\n    }\n\n    .padding-x-xxxs\\@lg {\n      padding-left: var(--space-xxxs);\n      padding-right: var(--space-xxxs);\n    }\n\n    .padding-x-xxs\\@lg {\n      padding-left: var(--space-xxs);\n      padding-right: var(--space-xxs);\n    }\n\n    .padding-x-xs\\@lg {\n      padding-left: var(--space-xs);\n      padding-right: var(--space-xs);\n    }\n\n    .padding-x-sm\\@lg {\n      padding-left: var(--space-sm);\n      padding-right: var(--space-sm);\n    }\n\n    .padding-x-md\\@lg {\n      padding-left: var(--space-md);\n      padding-right: var(--space-md);\n    }\n\n    .padding-x-lg\\@lg {\n      padding-left: var(--space-lg);\n      padding-right: var(--space-lg);\n    }\n\n    .padding-x-xl\\@lg {\n      padding-left: var(--space-xl);\n      padding-right: var(--space-xl);\n    }\n\n    .padding-x-xxl\\@lg {\n      padding-left: var(--space-xxl);\n      padding-right: var(--space-xxl);\n    }\n\n    .padding-x-xxxl\\@lg {\n      padding-left: var(--space-xxxl);\n      padding-right: var(--space-xxxl);\n    }\n\n    .padding-x-xxxxl\\@lg {\n      padding-left: var(--space-xxxxl);\n      padding-right: var(--space-xxxxl);\n    }\n\n    .padding-x-0\\@lg {\n      padding-left: 0;\n      padding-right: 0;\n    }\n\n    .padding-x-component\\@lg {\n      padding-left: var(--component-padding);\n      padding-right: var(--component-padding);\n    }\n\n    .padding-y-xxxxs\\@lg {\n      padding-top: var(--space-xxxxs);\n      padding-bottom: var(--space-xxxxs);\n    }\n\n    .padding-y-xxxs\\@lg {\n      padding-top: var(--space-xxxs);\n      padding-bottom: var(--space-xxxs);\n    }\n\n    .padding-y-xxs\\@lg {\n      padding-top: var(--space-xxs);\n      padding-bottom: var(--space-xxs);\n    }\n\n    .padding-y-xs\\@lg {\n      padding-top: var(--space-xs);\n      padding-bottom: var(--space-xs);\n    }\n\n    .padding-y-sm\\@lg {\n      padding-top: var(--space-sm);\n      padding-bottom: var(--space-sm);\n    }\n\n    .padding-y-md\\@lg {\n      padding-top: var(--space-md);\n      padding-bottom: var(--space-md);\n    }\n\n    .padding-y-lg\\@lg {\n      padding-top: var(--space-lg);\n      padding-bottom: var(--space-lg);\n    }\n\n    .padding-y-xl\\@lg {\n      padding-top: var(--space-xl);\n      padding-bottom: var(--space-xl);\n    }\n\n    .padding-y-xxl\\@lg {\n      padding-top: var(--space-xxl);\n      padding-bottom: var(--space-xxl);\n    }\n\n    .padding-y-xxxl\\@lg {\n      padding-top: var(--space-xxxl);\n      padding-bottom: var(--space-xxxl);\n    }\n\n    .padding-y-xxxxl\\@lg {\n      padding-top: var(--space-xxxxl);\n      padding-bottom: var(--space-xxxxl);\n    }\n\n    .padding-y-0\\@lg {\n      padding-top: 0;\n      padding-bottom: 0;\n    }\n\n    .padding-y-component\\@lg {\n      padding-top: var(--component-padding);\n      padding-bottom: var(--component-padding);\n    }\n  }\n  .text-center\\@lg {\n    text-align: center;\n  }\n\n  .text-left\\@lg {\n    text-align: left;\n  }\n\n  .text-right\\@lg {\n    text-align: right;\n  }\n\n  .text-justify\\@lg {\n    text-align: justify;\n  }\n\n  @supports (--css: variables) {\n    .text-xs\\@lg {\n      font-size: var(--text-xs, 0.694em);\n    }\n\n    .text-sm\\@lg {\n      font-size: var(--text-sm, 0.833em);\n    }\n\n    .text-base\\@lg {\n      font-size: var(--text-unit, 1em);\n    }\n\n    .text-md\\@lg {\n      font-size: var(--text-md, 1.2em);\n    }\n\n    .text-lg\\@lg {\n      font-size: var(--text-lg, 1.44em);\n    }\n\n    .text-xl\\@lg {\n      font-size: var(--text-xl, 1.728em);\n    }\n\n    .text-xxl\\@lg {\n      font-size: var(--text-xxl, 2.074em);\n    }\n\n    .text-xxxl\\@lg {\n      font-size: var(--text-xxxl, 2.488em);\n    }\n\n    .text-xxxxl\\@lg {\n      font-size: var(--text-xxxxl, 2.985em);\n    }\n  }\n  @supports (--css: variables) {\n    .width-xxxxs\\@lg {\n      width: var(--size-xxxxs, 0.25rem);\n    }\n\n    .width-xxxs\\@lg {\n      width: var(--size-xxxs, 0.5rem);\n    }\n\n    .width-xxs\\@lg {\n      width: var(--size-xxs, 0.75rem);\n    }\n\n    .width-xs\\@lg {\n      width: var(--size-xs, 1rem);\n    }\n\n    .width-sm\\@lg {\n      width: var(--size-sm, 1.5rem);\n    }\n\n    .width-md\\@lg {\n      width: var(--size-md, 2rem);\n    }\n\n    .width-lg\\@lg {\n      width: var(--size-lg, 3rem);\n    }\n\n    .width-xl\\@lg {\n      width: var(--size-xl, 4rem);\n    }\n\n    .width-xxl\\@lg {\n      width: var(--size-xxl, 6rem);\n    }\n\n    .width-xxxl\\@lg {\n      width: var(--size-xxxl, 8rem);\n    }\n\n    .width-xxxxl\\@lg {\n      width: var(--size-xxxxl, 16rem);\n    }\n  }\n  .width-0\\@lg {\n    width: 0;\n  }\n\n  .width-10\\%\\@lg {\n    width: 10%;\n  }\n\n  .width-20\\%\\@lg {\n    width: 20%;\n  }\n\n  .width-25\\%\\@lg {\n    width: 25%;\n  }\n\n  .width-30\\%\\@lg {\n    width: 30%;\n  }\n\n  .width-33\\%\\@lg {\n    width: calc(100% / 3);\n  }\n\n  .width-40\\%\\@lg {\n    width: 40%;\n  }\n\n  .width-50\\%\\@lg {\n    width: 50%;\n  }\n\n  .width-60\\%\\@lg {\n    width: 60%;\n  }\n\n  .width-66\\%\\@lg {\n    width: calc(100% / 1.5);\n  }\n\n  .width-70\\%\\@lg {\n    width: 70%;\n  }\n\n  .width-75\\%\\@lg {\n    width: 75%;\n  }\n\n  .width-80\\%\\@lg {\n    width: 80%;\n  }\n\n  .width-90\\%\\@lg {\n    width: 90%;\n  }\n\n  .width-100\\%\\@lg {\n    width: 100%;\n  }\n\n  .width-100vw\\@lg {\n    width: 100vw;\n  }\n\n  .width-auto\\@lg {\n    width: auto;\n  }\n\n  @supports (--css: variables) {\n    .height-xxxxs\\@lg {\n      height: var(--size-xxxxs, 0.25rem);\n    }\n\n    .height-xxxs\\@lg {\n      height: var(--size-xxxs, 0.5rem);\n    }\n\n    .height-xxs\\@lg {\n      height: var(--size-xxs, 0.75rem);\n    }\n\n    .height-xs\\@lg {\n      height: var(--size-xs, 1rem);\n    }\n\n    .height-sm\\@lg {\n      height: var(--size-sm, 1.5rem);\n    }\n\n    .height-md\\@lg {\n      height: var(--size-md, 2rem);\n    }\n\n    .height-lg\\@lg {\n      height: var(--size-lg, 3rem);\n    }\n\n    .height-xl\\@lg {\n      height: var(--size-xl, 4rem);\n    }\n\n    .height-xxl\\@lg {\n      height: var(--size-xxl, 6rem);\n    }\n\n    .height-xxxl\\@lg {\n      height: var(--size-xxxl, 8rem);\n    }\n\n    .height-xxxxl\\@lg {\n      height: var(--size-xxxxl, 16rem);\n    }\n  }\n  .height-0\\@lg {\n    height: 0;\n  }\n\n  .height-10\\%\\@lg {\n    height: 10%;\n  }\n\n  .height-20\\%\\@lg {\n    height: 20%;\n  }\n\n  .height-25\\%\\@lg {\n    height: 25%;\n  }\n\n  .height-30\\%\\@lg {\n    height: 30%;\n  }\n\n  .height-33\\%\\@lg {\n    height: calc(100% / 3);\n  }\n\n  .height-40\\%\\@lg {\n    height: 40%;\n  }\n\n  .height-50\\%\\@lg {\n    height: 50%;\n  }\n\n  .height-60\\%\\@lg {\n    height: 60%;\n  }\n\n  .height-66\\%\\@lg {\n    height: calc(100% / 1.5);\n  }\n\n  .height-70\\%\\@lg {\n    height: 70%;\n  }\n\n  .height-75\\%\\@lg {\n    height: 75%;\n  }\n\n  .height-80\\%\\@lg {\n    height: 80%;\n  }\n\n  .height-90\\%\\@lg {\n    height: 90%;\n  }\n\n  .height-100\\%\\@lg {\n    height: 100%;\n  }\n\n  .height-100vh\\@lg {\n    height: 100vh;\n  }\n\n  .height-auto\\@lg {\n    height: auto;\n  }\n\n  .position-relative\\@lg {\n    position: relative;\n  }\n\n  .position-absolute\\@lg {\n    position: absolute;\n  }\n\n  .position-fixed\\@lg {\n    position: fixed;\n  }\n\n  .position-sticky\\@lg {\n    position: sticky;\n  }\n\n  .position-static\\@lg {\n    position: static;\n  }\n\n  .top-0\\@lg {\n    top: 0;\n  }\n\n  .top-50\\%\\@lg {\n    top: 50%;\n  }\n\n  .bottom-0\\@lg {\n    bottom: 0;\n  }\n\n  .bottom-50\\%\\@lg {\n    bottom: 50%;\n  }\n\n  .left-0\\@lg {\n    left: 0;\n  }\n\n  .left-50\\%\\@lg {\n    left: 50%;\n  }\n\n  .right-0\\@lg {\n    right: 0;\n  }\n\n  .right-50\\%\\@lg {\n    right: 50%;\n  }\n\n  .inset-0\\@lg {\n    top: 0;\n    right: 0;\n    bottom: 0;\n    left: 0;\n  }\n\n  .hide\\@lg {\n    display: none !important;\n  }\n}\n@media not all and (min-width: 80rem) {\n  .has-margin\\@lg {\n    margin: 0 !important;\n  }\n\n  .has-padding\\@lg {\n    padding: 0 !important;\n  }\n\n  .display\\@lg {\n    display: none !important;\n  }\n}\n@media (min-width: 90rem) {\n  .flex\\@xl {\n    display: flex;\n  }\n\n  .inline-flex\\@xl {\n    display: inline-flex;\n  }\n\n  .flex-wrap\\@xl {\n    flex-wrap: wrap;\n  }\n\n  .flex-column\\@xl {\n    flex-direction: column;\n  }\n\n  .flex-column-reverse\\@xl {\n    flex-direction: column-reverse;\n  }\n\n  .flex-row\\@xl {\n    flex-direction: row;\n  }\n\n  .flex-row-reverse\\@xl {\n    flex-direction: row-reverse;\n  }\n\n  .flex-center\\@xl {\n    justify-content: center;\n    align-items: center;\n  }\n\n  .flex-grow\\@xl {\n    flex-grow: 1;\n  }\n\n  .flex-grow-0\\@xl {\n    flex-grow: 0;\n  }\n\n  .flex-shrink\\@xl {\n    flex-shrink: 1;\n  }\n\n  .flex-shrink-0\\@xl {\n    flex-shrink: 0;\n  }\n\n  .flex-basis-0\\@xl {\n    flex-basis: 0;\n  }\n\n  .justify-start\\@xl {\n    justify-content: flex-start;\n  }\n\n  .justify-end\\@xl {\n    justify-content: flex-end;\n  }\n\n  .justify-center\\@xl {\n    justify-content: center;\n  }\n\n  .justify-between\\@xl {\n    justify-content: space-between;\n  }\n\n  .items-center\\@xl {\n    align-items: center;\n  }\n\n  .items-start\\@xl {\n    align-items: flex-start;\n  }\n\n  .items-end\\@xl {\n    align-items: flex-end;\n  }\n\n  .items-baseline\\@xl {\n    align-items: baseline;\n  }\n\n  .order-1\\@xl {\n    order: 1;\n  }\n\n  .order-2\\@xl {\n    order: 2;\n  }\n\n  .order-3\\@xl {\n    order: 3;\n  }\n\n  .block\\@xl {\n    display: block;\n  }\n\n  .inline-block\\@xl {\n    display: inline-block;\n  }\n\n  .inline\\@xl {\n    display: inline;\n  }\n\n  @supports (--css: variables) {\n    .margin-xxxxs\\@xl {\n      margin: var(--space-xxxxs);\n    }\n\n    .margin-xxxs\\@xl {\n      margin: var(--space-xxxs);\n    }\n\n    .margin-xxs\\@xl {\n      margin: var(--space-xxs);\n    }\n\n    .margin-xs\\@xl {\n      margin: var(--space-xs);\n    }\n\n    .margin-sm\\@xl {\n      margin: var(--space-sm);\n    }\n\n    .margin-md\\@xl {\n      margin: var(--space-md);\n    }\n\n    .margin-lg\\@xl {\n      margin: var(--space-lg);\n    }\n\n    .margin-xl\\@xl {\n      margin: var(--space-xl);\n    }\n\n    .margin-xxl\\@xl {\n      margin: var(--space-xxl);\n    }\n\n    .margin-xxxl\\@xl {\n      margin: var(--space-xxxl);\n    }\n\n    .margin-xxxxl\\@xl {\n      margin: var(--space-xxxxl);\n    }\n\n    .margin-auto\\@xl {\n      margin: auto;\n    }\n\n    .margin-0\\@xl {\n      margin: 0;\n    }\n\n    .margin-top-xxxxs\\@xl {\n      margin-top: var(--space-xxxxs);\n    }\n\n    .margin-top-xxxs\\@xl {\n      margin-top: var(--space-xxxs);\n    }\n\n    .margin-top-xxs\\@xl {\n      margin-top: var(--space-xxs);\n    }\n\n    .margin-top-xs\\@xl {\n      margin-top: var(--space-xs);\n    }\n\n    .margin-top-sm\\@xl {\n      margin-top: var(--space-sm);\n    }\n\n    .margin-top-md\\@xl {\n      margin-top: var(--space-md);\n    }\n\n    .margin-top-lg\\@xl {\n      margin-top: var(--space-lg);\n    }\n\n    .margin-top-xl\\@xl {\n      margin-top: var(--space-xl);\n    }\n\n    .margin-top-xxl\\@xl {\n      margin-top: var(--space-xxl);\n    }\n\n    .margin-top-xxxl\\@xl {\n      margin-top: var(--space-xxxl);\n    }\n\n    .margin-top-xxxxl\\@xl {\n      margin-top: var(--space-xxxxl);\n    }\n\n    .margin-top-auto\\@xl {\n      margin-top: auto;\n    }\n\n    .margin-top-0\\@xl {\n      margin-top: 0;\n    }\n\n    .margin-bottom-xxxxs\\@xl {\n      margin-bottom: var(--space-xxxxs);\n    }\n\n    .margin-bottom-xxxs\\@xl {\n      margin-bottom: var(--space-xxxs);\n    }\n\n    .margin-bottom-xxs\\@xl {\n      margin-bottom: var(--space-xxs);\n    }\n\n    .margin-bottom-xs\\@xl {\n      margin-bottom: var(--space-xs);\n    }\n\n    .margin-bottom-sm\\@xl {\n      margin-bottom: var(--space-sm);\n    }\n\n    .margin-bottom-md\\@xl {\n      margin-bottom: var(--space-md);\n    }\n\n    .margin-bottom-lg\\@xl {\n      margin-bottom: var(--space-lg);\n    }\n\n    .margin-bottom-xl\\@xl {\n      margin-bottom: var(--space-xl);\n    }\n\n    .margin-bottom-xxl\\@xl {\n      margin-bottom: var(--space-xxl);\n    }\n\n    .margin-bottom-xxxl\\@xl {\n      margin-bottom: var(--space-xxxl);\n    }\n\n    .margin-bottom-xxxxl\\@xl {\n      margin-bottom: var(--space-xxxxl);\n    }\n\n    .margin-bottom-auto\\@xl {\n      margin-bottom: auto;\n    }\n\n    .margin-bottom-0\\@xl {\n      margin-bottom: 0;\n    }\n\n    .margin-right-xxxxs\\@xl {\n      margin-right: var(--space-xxxxs);\n    }\n\n    .margin-right-xxxs\\@xl {\n      margin-right: var(--space-xxxs);\n    }\n\n    .margin-right-xxs\\@xl {\n      margin-right: var(--space-xxs);\n    }\n\n    .margin-right-xs\\@xl {\n      margin-right: var(--space-xs);\n    }\n\n    .margin-right-sm\\@xl {\n      margin-right: var(--space-sm);\n    }\n\n    .margin-right-md\\@xl {\n      margin-right: var(--space-md);\n    }\n\n    .margin-right-lg\\@xl {\n      margin-right: var(--space-lg);\n    }\n\n    .margin-right-xl\\@xl {\n      margin-right: var(--space-xl);\n    }\n\n    .margin-right-xxl\\@xl {\n      margin-right: var(--space-xxl);\n    }\n\n    .margin-right-xxxl\\@xl {\n      margin-right: var(--space-xxxl);\n    }\n\n    .margin-right-xxxxl\\@xl {\n      margin-right: var(--space-xxxxl);\n    }\n\n    .margin-right-auto\\@xl {\n      margin-right: auto;\n    }\n\n    .margin-right-0\\@xl {\n      margin-right: 0;\n    }\n\n    .margin-left-xxxxs\\@xl {\n      margin-left: var(--space-xxxxs);\n    }\n\n    .margin-left-xxxs\\@xl {\n      margin-left: var(--space-xxxs);\n    }\n\n    .margin-left-xxs\\@xl {\n      margin-left: var(--space-xxs);\n    }\n\n    .margin-left-xs\\@xl {\n      margin-left: var(--space-xs);\n    }\n\n    .margin-left-sm\\@xl {\n      margin-left: var(--space-sm);\n    }\n\n    .margin-left-md\\@xl {\n      margin-left: var(--space-md);\n    }\n\n    .margin-left-lg\\@xl {\n      margin-left: var(--space-lg);\n    }\n\n    .margin-left-xl\\@xl {\n      margin-left: var(--space-xl);\n    }\n\n    .margin-left-xxl\\@xl {\n      margin-left: var(--space-xxl);\n    }\n\n    .margin-left-xxxl\\@xl {\n      margin-left: var(--space-xxxl);\n    }\n\n    .margin-left-xxxxl\\@xl {\n      margin-left: var(--space-xxxxl);\n    }\n\n    .margin-left-auto\\@xl {\n      margin-left: auto;\n    }\n\n    .margin-left-0\\@xl {\n      margin-left: 0;\n    }\n\n    .margin-x-xxxxs\\@xl {\n      margin-left: var(--space-xxxxs);\n      margin-right: var(--space-xxxxs);\n    }\n\n    .margin-x-xxxs\\@xl {\n      margin-left: var(--space-xxxs);\n      margin-right: var(--space-xxxs);\n    }\n\n    .margin-x-xxs\\@xl {\n      margin-left: var(--space-xxs);\n      margin-right: var(--space-xxs);\n    }\n\n    .margin-x-xs\\@xl {\n      margin-left: var(--space-xs);\n      margin-right: var(--space-xs);\n    }\n\n    .margin-x-sm\\@xl {\n      margin-left: var(--space-sm);\n      margin-right: var(--space-sm);\n    }\n\n    .margin-x-md\\@xl {\n      margin-left: var(--space-md);\n      margin-right: var(--space-md);\n    }\n\n    .margin-x-lg\\@xl {\n      margin-left: var(--space-lg);\n      margin-right: var(--space-lg);\n    }\n\n    .margin-x-xl\\@xl {\n      margin-left: var(--space-xl);\n      margin-right: var(--space-xl);\n    }\n\n    .margin-x-xxl\\@xl {\n      margin-left: var(--space-xxl);\n      margin-right: var(--space-xxl);\n    }\n\n    .margin-x-xxxl\\@xl {\n      margin-left: var(--space-xxxl);\n      margin-right: var(--space-xxxl);\n    }\n\n    .margin-x-xxxxl\\@xl {\n      margin-left: var(--space-xxxxl);\n      margin-right: var(--space-xxxxl);\n    }\n\n    .margin-x-auto\\@xl {\n      margin-left: auto;\n      margin-right: auto;\n    }\n\n    .margin-x-0\\@xl {\n      margin-left: 0;\n      margin-right: 0;\n    }\n\n    .margin-y-xxxxs\\@xl {\n      margin-top: var(--space-xxxxs);\n      margin-bottom: var(--space-xxxxs);\n    }\n\n    .margin-y-xxxs\\@xl {\n      margin-top: var(--space-xxxs);\n      margin-bottom: var(--space-xxxs);\n    }\n\n    .margin-y-xxs\\@xl {\n      margin-top: var(--space-xxs);\n      margin-bottom: var(--space-xxs);\n    }\n\n    .margin-y-xs\\@xl {\n      margin-top: var(--space-xs);\n      margin-bottom: var(--space-xs);\n    }\n\n    .margin-y-sm\\@xl {\n      margin-top: var(--space-sm);\n      margin-bottom: var(--space-sm);\n    }\n\n    .margin-y-md\\@xl {\n      margin-top: var(--space-md);\n      margin-bottom: var(--space-md);\n    }\n\n    .margin-y-lg\\@xl {\n      margin-top: var(--space-lg);\n      margin-bottom: var(--space-lg);\n    }\n\n    .margin-y-xl\\@xl {\n      margin-top: var(--space-xl);\n      margin-bottom: var(--space-xl);\n    }\n\n    .margin-y-xxl\\@xl {\n      margin-top: var(--space-xxl);\n      margin-bottom: var(--space-xxl);\n    }\n\n    .margin-y-xxxl\\@xl {\n      margin-top: var(--space-xxxl);\n      margin-bottom: var(--space-xxxl);\n    }\n\n    .margin-y-xxxxl\\@xl {\n      margin-top: var(--space-xxxxl);\n      margin-bottom: var(--space-xxxxl);\n    }\n\n    .margin-y-auto\\@xl {\n      margin-top: auto;\n      margin-bottom: auto;\n    }\n\n    .margin-y-0\\@xl {\n      margin-top: 0;\n      margin-bottom: 0;\n    }\n  }\n  @supports (--css: variables) {\n    .padding-xxxxs\\@xl {\n      padding: var(--space-xxxxs);\n    }\n\n    .padding-xxxs\\@xl {\n      padding: var(--space-xxxs);\n    }\n\n    .padding-xxs\\@xl {\n      padding: var(--space-xxs);\n    }\n\n    .padding-xs\\@xl {\n      padding: var(--space-xs);\n    }\n\n    .padding-sm\\@xl {\n      padding: var(--space-sm);\n    }\n\n    .padding-md\\@xl {\n      padding: var(--space-md);\n    }\n\n    .padding-lg\\@xl {\n      padding: var(--space-lg);\n    }\n\n    .padding-xl\\@xl {\n      padding: var(--space-xl);\n    }\n\n    .padding-xxl\\@xl {\n      padding: var(--space-xxl);\n    }\n\n    .padding-xxxl\\@xl {\n      padding: var(--space-xxxl);\n    }\n\n    .padding-xxxxl\\@xl {\n      padding: var(--space-xxxxl);\n    }\n\n    .padding-0\\@xl {\n      padding: 0;\n    }\n\n    .padding-component\\@xl {\n      padding: var(--component-padding);\n    }\n\n    .padding-top-xxxxs\\@xl {\n      padding-top: var(--space-xxxxs);\n    }\n\n    .padding-top-xxxs\\@xl {\n      padding-top: var(--space-xxxs);\n    }\n\n    .padding-top-xxs\\@xl {\n      padding-top: var(--space-xxs);\n    }\n\n    .padding-top-xs\\@xl {\n      padding-top: var(--space-xs);\n    }\n\n    .padding-top-sm\\@xl {\n      padding-top: var(--space-sm);\n    }\n\n    .padding-top-md\\@xl {\n      padding-top: var(--space-md);\n    }\n\n    .padding-top-lg\\@xl {\n      padding-top: var(--space-lg);\n    }\n\n    .padding-top-xl\\@xl {\n      padding-top: var(--space-xl);\n    }\n\n    .padding-top-xxl\\@xl {\n      padding-top: var(--space-xxl);\n    }\n\n    .padding-top-xxxl\\@xl {\n      padding-top: var(--space-xxxl);\n    }\n\n    .padding-top-xxxxl\\@xl {\n      padding-top: var(--space-xxxxl);\n    }\n\n    .padding-top-0\\@xl {\n      padding-top: 0;\n    }\n\n    .padding-top-component\\@xl {\n      padding-top: var(--component-padding);\n    }\n\n    .padding-bottom-xxxxs\\@xl {\n      padding-bottom: var(--space-xxxxs);\n    }\n\n    .padding-bottom-xxxs\\@xl {\n      padding-bottom: var(--space-xxxs);\n    }\n\n    .padding-bottom-xxs\\@xl {\n      padding-bottom: var(--space-xxs);\n    }\n\n    .padding-bottom-xs\\@xl {\n      padding-bottom: var(--space-xs);\n    }\n\n    .padding-bottom-sm\\@xl {\n      padding-bottom: var(--space-sm);\n    }\n\n    .padding-bottom-md\\@xl {\n      padding-bottom: var(--space-md);\n    }\n\n    .padding-bottom-lg\\@xl {\n      padding-bottom: var(--space-lg);\n    }\n\n    .padding-bottom-xl\\@xl {\n      padding-bottom: var(--space-xl);\n    }\n\n    .padding-bottom-xxl\\@xl {\n      padding-bottom: var(--space-xxl);\n    }\n\n    .padding-bottom-xxxl\\@xl {\n      padding-bottom: var(--space-xxxl);\n    }\n\n    .padding-bottom-xxxxl\\@xl {\n      padding-bottom: var(--space-xxxxl);\n    }\n\n    .padding-bottom-0\\@xl {\n      padding-bottom: 0;\n    }\n\n    .padding-bottom-component\\@xl {\n      padding-bottom: var(--component-padding);\n    }\n\n    .padding-right-xxxxs\\@xl {\n      padding-right: var(--space-xxxxs);\n    }\n\n    .padding-right-xxxs\\@xl {\n      padding-right: var(--space-xxxs);\n    }\n\n    .padding-right-xxs\\@xl {\n      padding-right: var(--space-xxs);\n    }\n\n    .padding-right-xs\\@xl {\n      padding-right: var(--space-xs);\n    }\n\n    .padding-right-sm\\@xl {\n      padding-right: var(--space-sm);\n    }\n\n    .padding-right-md\\@xl {\n      padding-right: var(--space-md);\n    }\n\n    .padding-right-lg\\@xl {\n      padding-right: var(--space-lg);\n    }\n\n    .padding-right-xl\\@xl {\n      padding-right: var(--space-xl);\n    }\n\n    .padding-right-xxl\\@xl {\n      padding-right: var(--space-xxl);\n    }\n\n    .padding-right-xxxl\\@xl {\n      padding-right: var(--space-xxxl);\n    }\n\n    .padding-right-xxxxl\\@xl {\n      padding-right: var(--space-xxxxl);\n    }\n\n    .padding-right-0\\@xl {\n      padding-right: 0;\n    }\n\n    .padding-right-component\\@xl {\n      padding-right: var(--component-padding);\n    }\n\n    .padding-left-xxxxs\\@xl {\n      padding-left: var(--space-xxxxs);\n    }\n\n    .padding-left-xxxs\\@xl {\n      padding-left: var(--space-xxxs);\n    }\n\n    .padding-left-xxs\\@xl {\n      padding-left: var(--space-xxs);\n    }\n\n    .padding-left-xs\\@xl {\n      padding-left: var(--space-xs);\n    }\n\n    .padding-left-sm\\@xl {\n      padding-left: var(--space-sm);\n    }\n\n    .padding-left-md\\@xl {\n      padding-left: var(--space-md);\n    }\n\n    .padding-left-lg\\@xl {\n      padding-left: var(--space-lg);\n    }\n\n    .padding-left-xl\\@xl {\n      padding-left: var(--space-xl);\n    }\n\n    .padding-left-xxl\\@xl {\n      padding-left: var(--space-xxl);\n    }\n\n    .padding-left-xxxl\\@xl {\n      padding-left: var(--space-xxxl);\n    }\n\n    .padding-left-xxxxl\\@xl {\n      padding-left: var(--space-xxxxl);\n    }\n\n    .padding-left-0\\@xl {\n      padding-left: 0;\n    }\n\n    .padding-left-component\\@xl {\n      padding-left: var(--component-padding);\n    }\n\n    .padding-x-xxxxs\\@xl {\n      padding-left: var(--space-xxxxs);\n      padding-right: var(--space-xxxxs);\n    }\n\n    .padding-x-xxxs\\@xl {\n      padding-left: var(--space-xxxs);\n      padding-right: var(--space-xxxs);\n    }\n\n    .padding-x-xxs\\@xl {\n      padding-left: var(--space-xxs);\n      padding-right: var(--space-xxs);\n    }\n\n    .padding-x-xs\\@xl {\n      padding-left: var(--space-xs);\n      padding-right: var(--space-xs);\n    }\n\n    .padding-x-sm\\@xl {\n      padding-left: var(--space-sm);\n      padding-right: var(--space-sm);\n    }\n\n    .padding-x-md\\@xl {\n      padding-left: var(--space-md);\n      padding-right: var(--space-md);\n    }\n\n    .padding-x-lg\\@xl {\n      padding-left: var(--space-lg);\n      padding-right: var(--space-lg);\n    }\n\n    .padding-x-xl\\@xl {\n      padding-left: var(--space-xl);\n      padding-right: var(--space-xl);\n    }\n\n    .padding-x-xxl\\@xl {\n      padding-left: var(--space-xxl);\n      padding-right: var(--space-xxl);\n    }\n\n    .padding-x-xxxl\\@xl {\n      padding-left: var(--space-xxxl);\n      padding-right: var(--space-xxxl);\n    }\n\n    .padding-x-xxxxl\\@xl {\n      padding-left: var(--space-xxxxl);\n      padding-right: var(--space-xxxxl);\n    }\n\n    .padding-x-0\\@xl {\n      padding-left: 0;\n      padding-right: 0;\n    }\n\n    .padding-x-component\\@xl {\n      padding-left: var(--component-padding);\n      padding-right: var(--component-padding);\n    }\n\n    .padding-y-xxxxs\\@xl {\n      padding-top: var(--space-xxxxs);\n      padding-bottom: var(--space-xxxxs);\n    }\n\n    .padding-y-xxxs\\@xl {\n      padding-top: var(--space-xxxs);\n      padding-bottom: var(--space-xxxs);\n    }\n\n    .padding-y-xxs\\@xl {\n      padding-top: var(--space-xxs);\n      padding-bottom: var(--space-xxs);\n    }\n\n    .padding-y-xs\\@xl {\n      padding-top: var(--space-xs);\n      padding-bottom: var(--space-xs);\n    }\n\n    .padding-y-sm\\@xl {\n      padding-top: var(--space-sm);\n      padding-bottom: var(--space-sm);\n    }\n\n    .padding-y-md\\@xl {\n      padding-top: var(--space-md);\n      padding-bottom: var(--space-md);\n    }\n\n    .padding-y-lg\\@xl {\n      padding-top: var(--space-lg);\n      padding-bottom: var(--space-lg);\n    }\n\n    .padding-y-xl\\@xl {\n      padding-top: var(--space-xl);\n      padding-bottom: var(--space-xl);\n    }\n\n    .padding-y-xxl\\@xl {\n      padding-top: var(--space-xxl);\n      padding-bottom: var(--space-xxl);\n    }\n\n    .padding-y-xxxl\\@xl {\n      padding-top: var(--space-xxxl);\n      padding-bottom: var(--space-xxxl);\n    }\n\n    .padding-y-xxxxl\\@xl {\n      padding-top: var(--space-xxxxl);\n      padding-bottom: var(--space-xxxxl);\n    }\n\n    .padding-y-0\\@xl {\n      padding-top: 0;\n      padding-bottom: 0;\n    }\n\n    .padding-y-component\\@xl {\n      padding-top: var(--component-padding);\n      padding-bottom: var(--component-padding);\n    }\n  }\n  .text-center\\@xl {\n    text-align: center;\n  }\n\n  .text-left\\@xl {\n    text-align: left;\n  }\n\n  .text-right\\@xl {\n    text-align: right;\n  }\n\n  .text-justify\\@xl {\n    text-align: justify;\n  }\n\n  @supports (--css: variables) {\n    .text-xs\\@xl {\n      font-size: var(--text-xs, 0.694em);\n    }\n\n    .text-sm\\@xl {\n      font-size: var(--text-sm, 0.833em);\n    }\n\n    .text-base\\@xl {\n      font-size: var(--text-unit, 1em);\n    }\n\n    .text-md\\@xl {\n      font-size: var(--text-md, 1.2em);\n    }\n\n    .text-lg\\@xl {\n      font-size: var(--text-lg, 1.44em);\n    }\n\n    .text-xl\\@xl {\n      font-size: var(--text-xl, 1.728em);\n    }\n\n    .text-xxl\\@xl {\n      font-size: var(--text-xxl, 2.074em);\n    }\n\n    .text-xxxl\\@xl {\n      font-size: var(--text-xxxl, 2.488em);\n    }\n\n    .text-xxxxl\\@xl {\n      font-size: var(--text-xxxxl, 2.985em);\n    }\n  }\n  @supports (--css: variables) {\n    .width-xxxxs\\@xl {\n      width: var(--size-xxxxs, 0.25rem);\n    }\n\n    .width-xxxs\\@xl {\n      width: var(--size-xxxs, 0.5rem);\n    }\n\n    .width-xxs\\@xl {\n      width: var(--size-xxs, 0.75rem);\n    }\n\n    .width-xs\\@xl {\n      width: var(--size-xs, 1rem);\n    }\n\n    .width-sm\\@xl {\n      width: var(--size-sm, 1.5rem);\n    }\n\n    .width-md\\@xl {\n      width: var(--size-md, 2rem);\n    }\n\n    .width-lg\\@xl {\n      width: var(--size-lg, 3rem);\n    }\n\n    .width-xl\\@xl {\n      width: var(--size-xl, 4rem);\n    }\n\n    .width-xxl\\@xl {\n      width: var(--size-xxl, 6rem);\n    }\n\n    .width-xxxl\\@xl {\n      width: var(--size-xxxl, 8rem);\n    }\n\n    .width-xxxxl\\@xl {\n      width: var(--size-xxxxl, 16rem);\n    }\n  }\n  .width-0\\@xl {\n    width: 0;\n  }\n\n  .width-10\\%\\@xl {\n    width: 10%;\n  }\n\n  .width-20\\%\\@xl {\n    width: 20%;\n  }\n\n  .width-25\\%\\@xl {\n    width: 25%;\n  }\n\n  .width-30\\%\\@xl {\n    width: 30%;\n  }\n\n  .width-33\\%\\@xl {\n    width: calc(100% / 3);\n  }\n\n  .width-40\\%\\@xl {\n    width: 40%;\n  }\n\n  .width-50\\%\\@xl {\n    width: 50%;\n  }\n\n  .width-60\\%\\@xl {\n    width: 60%;\n  }\n\n  .width-66\\%\\@xl {\n    width: calc(100% / 1.5);\n  }\n\n  .width-70\\%\\@xl {\n    width: 70%;\n  }\n\n  .width-75\\%\\@xl {\n    width: 75%;\n  }\n\n  .width-80\\%\\@xl {\n    width: 80%;\n  }\n\n  .width-90\\%\\@xl {\n    width: 90%;\n  }\n\n  .width-100\\%\\@xl {\n    width: 100%;\n  }\n\n  .width-100vw\\@xl {\n    width: 100vw;\n  }\n\n  .width-auto\\@xl {\n    width: auto;\n  }\n\n  @supports (--css: variables) {\n    .height-xxxxs\\@xl {\n      height: var(--size-xxxxs, 0.25rem);\n    }\n\n    .height-xxxs\\@xl {\n      height: var(--size-xxxs, 0.5rem);\n    }\n\n    .height-xxs\\@xl {\n      height: var(--size-xxs, 0.75rem);\n    }\n\n    .height-xs\\@xl {\n      height: var(--size-xs, 1rem);\n    }\n\n    .height-sm\\@xl {\n      height: var(--size-sm, 1.5rem);\n    }\n\n    .height-md\\@xl {\n      height: var(--size-md, 2rem);\n    }\n\n    .height-lg\\@xl {\n      height: var(--size-lg, 3rem);\n    }\n\n    .height-xl\\@xl {\n      height: var(--size-xl, 4rem);\n    }\n\n    .height-xxl\\@xl {\n      height: var(--size-xxl, 6rem);\n    }\n\n    .height-xxxl\\@xl {\n      height: var(--size-xxxl, 8rem);\n    }\n\n    .height-xxxxl\\@xl {\n      height: var(--size-xxxxl, 16rem);\n    }\n  }\n  .height-0\\@xl {\n    height: 0;\n  }\n\n  .height-10\\%\\@xl {\n    height: 10%;\n  }\n\n  .height-20\\%\\@xl {\n    height: 20%;\n  }\n\n  .height-25\\%\\@xl {\n    height: 25%;\n  }\n\n  .height-30\\%\\@xl {\n    height: 30%;\n  }\n\n  .height-33\\%\\@xl {\n    height: calc(100% / 3);\n  }\n\n  .height-40\\%\\@xl {\n    height: 40%;\n  }\n\n  .height-50\\%\\@xl {\n    height: 50%;\n  }\n\n  .height-60\\%\\@xl {\n    height: 60%;\n  }\n\n  .height-66\\%\\@xl {\n    height: calc(100% / 1.5);\n  }\n\n  .height-70\\%\\@xl {\n    height: 70%;\n  }\n\n  .height-75\\%\\@xl {\n    height: 75%;\n  }\n\n  .height-80\\%\\@xl {\n    height: 80%;\n  }\n\n  .height-90\\%\\@xl {\n    height: 90%;\n  }\n\n  .height-100\\%\\@xl {\n    height: 100%;\n  }\n\n  .height-100vh\\@xl {\n    height: 100vh;\n  }\n\n  .height-auto\\@xl {\n    height: auto;\n  }\n\n  .position-relative\\@xl {\n    position: relative;\n  }\n\n  .position-absolute\\@xl {\n    position: absolute;\n  }\n\n  .position-fixed\\@xl {\n    position: fixed;\n  }\n\n  .position-sticky\\@xl {\n    position: sticky;\n  }\n\n  .position-static\\@xl {\n    position: static;\n  }\n\n  .top-0\\@xl {\n    top: 0;\n  }\n\n  .top-50\\%\\@xl {\n    top: 50%;\n  }\n\n  .bottom-0\\@xl {\n    bottom: 0;\n  }\n\n  .bottom-50\\%\\@xl {\n    bottom: 50%;\n  }\n\n  .left-0\\@xl {\n    left: 0;\n  }\n\n  .left-50\\%\\@xl {\n    left: 50%;\n  }\n\n  .right-0\\@xl {\n    right: 0;\n  }\n\n  .right-50\\%\\@xl {\n    right: 50%;\n  }\n\n  .inset-0\\@xl {\n    top: 0;\n    right: 0;\n    bottom: 0;\n    left: 0;\n  }\n\n  .hide\\@xl {\n    display: none !important;\n  }\n}\n@media not all and (min-width: 90rem) {\n  .has-margin\\@xl {\n    margin: 0 !important;\n  }\n\n  .has-padding\\@xl {\n    padding: 0 !important;\n  }\n\n  .display\\@xl {\n    display: none !important;\n  }\n}\n:root, [data-theme=default] {\n  --color-primary-darker: hsl(219, 52%, 41%);\n  --color-primary-darker-h: 219;\n  --color-primary-darker-s: 52%;\n  --color-primary-darker-l: 41%;\n  --color-primary-dark: hsl(219, 52%, 51%);\n  --color-primary-dark-h: 219;\n  --color-primary-dark-s: 52%;\n  --color-primary-dark-l: 51%;\n  --color-primary: hsl(219, 52%, 61%);\n  --color-primary-h: 219;\n  --color-primary-s: 52%;\n  --color-primary-l: 61%;\n  --color-primary-light: hsl(219, 52%, 81%);\n  --color-primary-light-h: 219;\n  --color-primary-light-s: 52%;\n  --color-primary-light-l: 81%;\n  --color-primary-lighter: hsl(221, 49%, 90%);\n  --color-primary-lighter-h: 221;\n  --color-primary-lighter-s: 49%;\n  --color-primary-lighter-l: 90%;\n  --color-accent-darker: hsl(349, 90%, 46%);\n  --color-accent-darker-h: 349;\n  --color-accent-darker-s: 90%;\n  --color-accent-darker-l: 46%;\n  --color-accent-dark: hsl(349, 90%, 56%);\n  --color-accent-dark-h: 349;\n  --color-accent-dark-s: 90%;\n  --color-accent-dark-l: 56%;\n  --color-accent: hsl(349, 90%, 66%);\n  --color-accent-h: 349;\n  --color-accent-s: 90%;\n  --color-accent-l: 66%;\n  --color-accent-light: hsl(349, 90%, 76%);\n  --color-accent-light-h: 349;\n  --color-accent-light-s: 90%;\n  --color-accent-light-l: 76%;\n  --color-accent-lighter: hsl(0, 68%, 91%);\n  --color-accent-lighter-h: 0;\n  --color-accent-lighter-s: 68%;\n  --color-accent-lighter-l: 91%;\n  --color-black: hsl(240, 8%, 12%);\n  --color-black-h: 240;\n  --color-black-s: 8%;\n  --color-black-l: 12%;\n  --color-white: hsl(0, 0%, 100%);\n  --color-white-h: 0;\n  --color-white-s: 0%;\n  --color-white-l: 100%;\n  --color-warning-darker: hsl(46, 100%, 47%);\n  --color-warning-darker-h: 46;\n  --color-warning-darker-s: 100%;\n  --color-warning-darker-l: 47%;\n  --color-warning-dark: hsl(46, 100%, 50%);\n  --color-warning-dark-h: 46;\n  --color-warning-dark-s: 100%;\n  --color-warning-dark-l: 50%;\n  --color-warning: hsl(46, 100%, 61%);\n  --color-warning-h: 46;\n  --color-warning-s: 100%;\n  --color-warning-l: 61%;\n  --color-warning-light: hsl(46, 100%, 71%);\n  --color-warning-light-h: 46;\n  --color-warning-light-s: 100%;\n  --color-warning-light-l: 71%;\n  --color-warning-lighter: hsl(46, 100%, 80%);\n  --color-warning-lighter-h: 46;\n  --color-warning-lighter-s: 100%;\n  --color-warning-lighter-l: 80%;\n  --color-success-darker: hsl(94, 48%, 42%);\n  --color-success-darker-h: 94;\n  --color-success-darker-s: 48%;\n  --color-success-darker-l: 42%;\n  --color-success-dark: hsl(94, 48%, 48%);\n  --color-success-dark-h: 94;\n  --color-success-dark-s: 48%;\n  --color-success-dark-l: 48%;\n  --color-success: hsl(94, 48%, 56%);\n  --color-success-h: 94;\n  --color-success-s: 48%;\n  --color-success-l: 56%;\n  --color-success-light: hsl(94, 48%, 65%);\n  --color-success-light-h: 94;\n  --color-success-light-s: 48%;\n  --color-success-light-l: 65%;\n  --color-success-lighter: hsl(94, 48%, 74%);\n  --color-success-lighter-h: 94;\n  --color-success-lighter-s: 48%;\n  --color-success-lighter-l: 74%;\n  --color-error-darker: hsl(349, 75%, 36%);\n  --color-error-darker-h: 349;\n  --color-error-darker-s: 75%;\n  --color-error-darker-l: 36%;\n  --color-error-dark: hsl(349, 75%, 44%);\n  --color-error-dark-h: 349;\n  --color-error-dark-s: 75%;\n  --color-error-dark-l: 44%;\n  --color-error: hsl(349, 75%, 51%);\n  --color-error-h: 349;\n  --color-error-s: 75%;\n  --color-error-l: 51%;\n  --color-error-light: hsl(349, 75%, 59%);\n  --color-error-light-h: 349;\n  --color-error-light-s: 75%;\n  --color-error-light-l: 59%;\n  --color-error-lighter: hsl(349, 75%, 67%);\n  --color-error-lighter-h: 349;\n  --color-error-lighter-s: 75%;\n  --color-error-lighter-l: 67%;\n  --color-bg: hsl(0, 0%, 100%);\n  --color-bg-h: 0;\n  --color-bg-s: 0%;\n  --color-bg-l: 100%;\n  --color-contrast-lower: hsl(0, 0%, 95%);\n  --color-contrast-lower-h: 0;\n  --color-contrast-lower-s: 0%;\n  --color-contrast-lower-l: 95%;\n  --color-contrast-low: hsl(240, 1%, 83%);\n  --color-contrast-low-h: 240;\n  --color-contrast-low-s: 1%;\n  --color-contrast-low-l: 83%;\n  --color-contrast-medium: hsl(240, 1%, 48%);\n  --color-contrast-medium-h: 240;\n  --color-contrast-medium-s: 1%;\n  --color-contrast-medium-l: 48%;\n  --color-contrast-high: hsl(240, 4%, 20%);\n  --color-contrast-high-h: 240;\n  --color-contrast-high-s: 4%;\n  --color-contrast-high-l: 20%;\n  --color-contrast-higher: hsl(240, 8%, 12%);\n  --color-contrast-higher-h: 240;\n  --color-contrast-higher-s: 8%;\n  --color-contrast-higher-l: 12%;\n}\n@supports (--css: variables) {\n  [data-theme=dark] {\n    --color-primary-darker: hsl(219, 52%, 41%);\n    --color-primary-darker-h: 219;\n    --color-primary-darker-s: 52%;\n    --color-primary-darker-l: 41%;\n    --color-primary-dark: hsl(219, 52%, 51%);\n    --color-primary-dark-h: 219;\n    --color-primary-dark-s: 52%;\n    --color-primary-dark-l: 51%;\n    --color-primary: hsl(219, 52%, 61%);\n    --color-primary-h: 219;\n    --color-primary-s: 52%;\n    --color-primary-l: 61%;\n    --color-primary-light: hsl(219, 52%, 81%);\n    --color-primary-light-h: 219;\n    --color-primary-light-s: 52%;\n    --color-primary-light-l: 81%;\n    --color-primary-lighter: hsl(221, 49%, 90%);\n    --color-primary-lighter-h: 221;\n    --color-primary-lighter-s: 49%;\n    --color-primary-lighter-l: 90%;\n    --color-accent-darker: hsl(349, 90%, 46%);\n    --color-accent-darker-h: 349;\n    --color-accent-darker-s: 90%;\n    --color-accent-darker-l: 46%;\n    --color-accent-dark: hsl(349, 90%, 56%);\n    --color-accent-dark-h: 349;\n    --color-accent-dark-s: 90%;\n    --color-accent-dark-l: 56%;\n    --color-accent: hsl(349, 90%, 66%);\n    --color-accent-h: 349;\n    --color-accent-s: 90%;\n    --color-accent-l: 66%;\n    --color-accent-light: hsl(349, 90%, 76%);\n    --color-accent-light-h: 349;\n    --color-accent-light-s: 90%;\n    --color-accent-light-l: 76%;\n    --color-accent-lighter: hsl(0, 68%, 21%);\n    --color-accent-lighter-h: 0;\n    --color-accent-lighter-s: 68%;\n    --color-accent-lighter-l: 21%;\n    --color-black: hsl(240, 8%, 12%);\n    --color-black-h: 240;\n    --color-black-s: 8%;\n    --color-black-l: 12%;\n    --color-white: hsl(0, 0%, 100%);\n    --color-white-h: 0;\n    --color-white-s: 0%;\n    --color-white-l: 100%;\n    --color-warning-darker: hsl(46, 100%, 47%);\n    --color-warning-darker-h: 46;\n    --color-warning-darker-s: 100%;\n    --color-warning-darker-l: 47%;\n    --color-warning-dark: hsl(46, 100%, 50%);\n    --color-warning-dark-h: 46;\n    --color-warning-dark-s: 100%;\n    --color-warning-dark-l: 50%;\n    --color-warning: hsl(46, 100%, 61%);\n    --color-warning-h: 46;\n    --color-warning-s: 100%;\n    --color-warning-l: 61%;\n    --color-warning-light: hsl(46, 100%, 71%);\n    --color-warning-light-h: 46;\n    --color-warning-light-s: 100%;\n    --color-warning-light-l: 71%;\n    --color-warning-lighter: hsl(46, 100%, 80%);\n    --color-warning-lighter-h: 46;\n    --color-warning-lighter-s: 100%;\n    --color-warning-lighter-l: 80%;\n    --color-success-darker: hsl(94, 48%, 42%);\n    --color-success-darker-h: 94;\n    --color-success-darker-s: 48%;\n    --color-success-darker-l: 42%;\n    --color-success-dark: hsl(94, 48%, 48%);\n    --color-success-dark-h: 94;\n    --color-success-dark-s: 48%;\n    --color-success-dark-l: 48%;\n    --color-success: hsl(94, 48%, 56%);\n    --color-success-h: 94;\n    --color-success-s: 48%;\n    --color-success-l: 56%;\n    --color-success-light: hsl(94, 48%, 65%);\n    --color-success-light-h: 94;\n    --color-success-light-s: 48%;\n    --color-success-light-l: 65%;\n    --color-success-lighter: hsl(94, 48%, 74%);\n    --color-success-lighter-h: 94;\n    --color-success-lighter-s: 48%;\n    --color-success-lighter-l: 74%;\n    --color-error-darker: hsl(349, 75%, 36%);\n    --color-error-darker-h: 349;\n    --color-error-darker-s: 75%;\n    --color-error-darker-l: 36%;\n    --color-error-dark: hsl(349, 75%, 44%);\n    --color-error-dark-h: 349;\n    --color-error-dark-s: 75%;\n    --color-error-dark-l: 44%;\n    --color-error: hsl(349, 75%, 51%);\n    --color-error-h: 349;\n    --color-error-s: 75%;\n    --color-error-l: 51%;\n    --color-error-light: hsl(349, 75%, 59%);\n    --color-error-light-h: 349;\n    --color-error-light-s: 75%;\n    --color-error-light-l: 59%;\n    --color-error-lighter: hsl(349, 75%, 67%);\n    --color-error-lighter-h: 349;\n    --color-error-lighter-s: 75%;\n    --color-error-lighter-l: 67%;\n    --color-bg: hsl(240, 8%, 12%);\n    --color-bg-h: 240;\n    --color-bg-s: 8%;\n    --color-bg-l: 12%;\n    --color-contrast-lower: hsl(240, 6%, 15%);\n    --color-contrast-lower-h: 240;\n    --color-contrast-lower-s: 6%;\n    --color-contrast-lower-l: 15%;\n    --color-contrast-low: hsl(240, 3%, 24%);\n    --color-contrast-low-h: 240;\n    --color-contrast-low-s: 3%;\n    --color-contrast-low-l: 24%;\n    --color-contrast-medium: hsl(240, 1%, 56%);\n    --color-contrast-medium-h: 240;\n    --color-contrast-medium-s: 1%;\n    --color-contrast-medium-l: 56%;\n    --color-contrast-high: hsl(240, 2%, 87%);\n    --color-contrast-high-h: 240;\n    --color-contrast-high-s: 2%;\n    --color-contrast-high-l: 87%;\n    --color-contrast-higher: hsl(0, 0%, 98%);\n    --color-contrast-higher-h: 0;\n    --color-contrast-higher-s: 0%;\n    --color-contrast-higher-l: 98%;\n  }\n}\n@supports (--css: variables) {\n  @media (min-width: 64rem) {\n    :root {\n      --space-unit: 1.25em;\n    }\n  }\n}\n:root {\n  --radius: 0.25em;\n}\n.hover\\:elevate {\n  box-shadow: var(--shadow-sm);\n  transition: 0.2s;\n}\n.hover\\:elevate:hover {\n  box-shadow: var(--shadow-md);\n}\n:root {\n  --font-primary: Inter, system-ui, sans-serif;\n  --text-base-size: 1em;\n  --text-scale-ratio: 1.2;\n  --body-line-height: 1.4;\n  --heading-line-height: 1.2;\n  --font-primary-capital-letter: 1;\n  --text-unit: 1em;\n}\n:root, * {\n  --text-xs: calc((var(--text-unit) / var(--text-scale-ratio)) / var(--text-scale-ratio));\n  --text-sm: calc(var(--text-xs) * var(--text-scale-ratio));\n  --text-md: calc(var(--text-sm) * var(--text-scale-ratio) * var(--text-scale-ratio));\n  --text-lg: calc(var(--text-md) * var(--text-scale-ratio));\n  --text-xl: calc(var(--text-lg) * var(--text-scale-ratio));\n  --text-xxl: calc(var(--text-xl) * var(--text-scale-ratio));\n  --text-xxxl: calc(var(--text-xxl) * var(--text-scale-ratio));\n  --text-xxxxl: calc(var(--text-xxxl) * var(--text-scale-ratio));\n}\n@supports (--css: variables) {\n  @media (min-width: 64rem) {\n    :root {\n      --text-base-size: 1.25em;\n      --text-scale-ratio: 1.25;\n    }\n  }\n}\nbody {\n  font-family: var(--font-primary);\n}\nh1, h2, h3, h4 {\n  font-family: var(--font-primary);\n  font-weight: 700;\n}\n.font-primary {\n  font-family: var(--font-primary);\n}\n.btn {\n  --btn-padding-y: var(--space-xxs);\n  --btn-padding-x: var(--space-sm);\n  --btn-radius: 0.25em;\n  --btn-font-size: 1em;\n  line-height: 1.2;\n  box-shadow: var(--shadow-xs);\n  -webkit-font-smoothing: antialiased;\n  -moz-osx-font-smoothing: grayscale;\n  transition: 0.2s;\n  color: var(--color-contrast-high);\n}\n.btn:hover {\n  cursor: pointer;\n  box-shadow: var(--shadow-sm);\n}\n.btn:focus {\n  outline: none;\n  box-shadow: 0px 0px 0px 2px hsla(var(--color-contrast-higher-h), var(--color-contrast-higher-s), var(--color-contrast-higher-l), 0.15);\n}\n.btn:active {\n  transform: translateY(2px);\n}\n.btn--primary {\n  margin-top: 1em;\n  background-color: var(--color-primary);\n  color: var(--color-bg);\n}\n.btn--primary:hover {\n  background-color: var(--color-primary-dark);\n}\n.btn--primary:focus {\n  box-shadow: 0px 0px 0px 2px hsla(var(--color-primary-h), var(--color-primary-s), var(--color-primary-l), 0.2);\n}\n.btn--subtle {\n  background-color: var(--color-contrast-lower);\n  color: var(--color-contrast-higher);\n}\n.btn--accent {\n  background-color: var(--color-accent);\n  color: var(--color-contrast-low);\n}\n.btn--accent:hover {\n  background-color: var(--color-accent-dark);\n}\n.btn--accent:focus {\n  box-shadow: 0px 0px 0px 2px hsla(var(--color-accent-h), var(--color-accent-s), var(--color-accent-l), 0.2);\n}\n.btn--disabled,\n.btn[disabled],\n.btn[readonly] {\n  opacity: 0.6;\n  cursor: not-allowed;\n}\n.btn--sm {\n  font-size: 0.8em;\n}\n.btn--md {\n  font-size: 1.2em;\n}\n.btn--lg {\n  font-size: 1.4em;\n}\n.form-control {\n  --form-control-padding-y: var(--space-xxs);\n  --form-control-padding-x: var(--space-xs);\n  --form-control-radius: 0.25em;\n  --form-control-font-size: 1em;\n  line-height: 1.2;\n  background-color: var(--color-bg);\n  color: var(--color-contrast-higher);\n  border: 2px solid var(--color-contrast-low);\n  transition: 0.2s;\n}\n.form-control::placeholder {\n  opacity: 1;\n  color: var(--color-contrast-medium);\n}\n.form-control:focus {\n  outline: none;\n  border-color: var(--color-primary);\n  box-shadow: 0 0 0 2px hsla(var(--color-primary-h), var(--color-primary-s), var(--color-primary-l), 0.2);\n}\n.form-control--error,\n.form-control[aria-invalid=true] {\n  border-color: var(--color-error);\n}\n.form-control--error:focus,\n.form-control[aria-invalid=true]:focus {\n  box-shadow: 0 0 0 2px hsla(var(--color-error-h), var(--color-error-s), var(--color-error-l), 0.2);\n}\n.form-control--disabled,\n.form-control[disabled],\n.form-control[readonly] {\n  cursor: not-allowed;\n}\nbody {\n  --body-line-height: font-family: "Open Sans", Helvetica, Arial, sans-serif;\n  font-size: 12px;\n  font-weight: 400;\n  background: var(--color-bg);\n  line-height: var(--body-line-height);\n  color: var(--paragraphTextColor);\n  -webkit-font-smoothing: antialiased;\n}\nh1 {\n  color: var(--color-primary);\n}\n.container {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  padding: 0px 20px;\n}\n.container > * {\n  width: 100%;\n  max-width: 700px;\n}';
var $layout_svelte = ".footer.svelte-q9wcox{margin:3rem 0;text-align:center}.flex-layout.svelte-q9wcox{min-height:100vh;display:flex;flex-direction:column;justify-content:space-between}";
const css = {
  code: ".footer.svelte-q9wcox{margin:3rem 0;text-align:center}.flex-layout.svelte-q9wcox{min-height:100vh;display:flex;flex-direction:column;justify-content:space-between}",
  map: `{"version":3,"file":"$layout.svelte","sources":["$layout.svelte"],"sourcesContent":["<script>\\n\\timport './../styles/reset.scss';\\n\\timport './../styles/globals.scss';\\n\\tdocument.getElementsByTagName('html')[0].className += ' js';\\n\\tlet theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';\\n\\tdocument.documentElement.setAttribute('data-theme', theme);\\n\\twindow.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {\\n\\t\\ttheme = e.matches ? 'dark' : 'light';\\n\\t\\tdocument.documentElement.setAttribute('data-theme', theme);\\n\\t});\\n</script>\\n\\n<div class=\\"flex-layout\\">\\n\\t<slot />\\n\\t<p class=\\"footer\\">\xA9 Acme Corp, 1951</p>\\n</div>\\n\\n<style>\\n\\t.footer {\\n\\t\\tmargin: 3rem 0;\\n\\t\\ttext-align: center;\\n\\t}\\n\\n\\t.flex-layout {\\n\\t\\tmin-height: 100vh;\\n\\t\\tdisplay: flex;\\n\\t\\tflex-direction: column;\\n\\t\\tjustify-content: space-between;\\n\\t}\\n</style>\\n"],"names":[],"mappings":"AAkBC,OAAO,cAAC,CAAC,AACR,MAAM,CAAE,IAAI,CAAC,CAAC,CACd,UAAU,CAAE,MAAM,AACnB,CAAC,AAED,YAAY,cAAC,CAAC,AACb,UAAU,CAAE,KAAK,CACjB,OAAO,CAAE,IAAI,CACb,cAAc,CAAE,MAAM,CACtB,eAAe,CAAE,aAAa,AAC/B,CAAC"}`
};
const $layout = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  document.getElementsByTagName("html")[0].className += " js";
  let theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    theme = e.matches ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
  });
  $$result.css.add(css);
  return `<div class="${"flex-layout svelte-q9wcox"}">${slots.default ? slots.default({}) : ``}
	<p class="${"footer svelte-q9wcox"}">\xA9 Acme Corp, 1951</p>
</div>`;
});
var $layout$1 = /* @__PURE__ */ Object.freeze({
  __proto__: null,
  [Symbol.toStringTag]: "Module",
  default: $layout
});
export {init, render};
