// GENERATED from src/pages-entry.js by scripts/build-functions.js — do not edit by hand.
// Self-contained on purpose: the Pages Git integration skips npm install when no
// build command is set, so this file must not contain bare imports to resolve.

var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/hono/dist/cjs/compose.js
var require_compose = __commonJS({
  "node_modules/hono/dist/cjs/compose.js"(exports, module) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var compose_exports = {};
    __export(compose_exports, {
      compose: () => compose
    });
    module.exports = __toCommonJS(compose_exports);
    var compose = (middleware, onError, onNotFound) => {
      return (context, next) => {
        let index = -1;
        return dispatch(0);
        async function dispatch(i) {
          if (i <= index) {
            throw new Error("next() called multiple times");
          }
          index = i;
          let res;
          let isError = false;
          let handler;
          if (middleware[i]) {
            handler = middleware[i][0][0];
            context.req.routeIndex = i;
          } else {
            handler = i === middleware.length && next || void 0;
          }
          if (handler) {
            try {
              res = await handler(context, () => dispatch(i + 1));
            } catch (err) {
              if (err instanceof Error && onError) {
                context.error = err;
                res = await onError(err, context);
                isError = true;
              } else {
                throw err;
              }
            }
          } else {
            if (context.finalized === false && onNotFound) {
              res = await onNotFound(context);
            }
          }
          if (res && (context.finalized === false || isError)) {
            context.res = res;
          }
          return context;
        }
      };
    };
  }
});

// node_modules/hono/dist/cjs/http-exception.js
var require_http_exception = __commonJS({
  "node_modules/hono/dist/cjs/http-exception.js"(exports, module) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var http_exception_exports = {};
    __export(http_exception_exports, {
      HTTPException: () => HTTPException
    });
    module.exports = __toCommonJS(http_exception_exports);
    var HTTPException = class extends Error {
      res;
      status;
      /**
       * Creates an instance of `HTTPException`.
       * @param status - HTTP status code for the exception. Defaults to 500.
       * @param options - Additional options for the exception.
       */
      constructor(status = 500, options) {
        super(options?.message, { cause: options?.cause });
        this.res = options?.res;
        this.status = status;
      }
      /**
       * Returns the response object associated with the exception.
       * If a response object is not provided, a new response is created with the error message and status code.
       * @returns The response object.
       */
      getResponse() {
        if (this.res) {
          const newResponse = new Response(this.res.body, {
            status: this.status,
            headers: this.res.headers
          });
          return newResponse;
        }
        return new Response(this.message, {
          status: this.status
        });
      }
    };
  }
});

// node_modules/hono/dist/cjs/request/constants.js
var require_constants = __commonJS({
  "node_modules/hono/dist/cjs/request/constants.js"(exports, module) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var constants_exports = {};
    __export(constants_exports, {
      GET_MATCH_RESULT: () => GET_MATCH_RESULT
    });
    module.exports = __toCommonJS(constants_exports);
    var GET_MATCH_RESULT = /* @__PURE__ */ Symbol();
  }
});

// node_modules/hono/dist/cjs/utils/crypto.js
var require_crypto = __commonJS({
  "node_modules/hono/dist/cjs/utils/crypto.js"(exports, module) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var crypto_exports = {};
    __export(crypto_exports, {
      createHash: () => createHash,
      md5: () => md5,
      sha1: () => sha1,
      sha256: () => sha256
    });
    module.exports = __toCommonJS(crypto_exports);
    var sha256 = async (data) => {
      const algorithm = { name: "SHA-256", alias: "sha256" };
      const hash = await createHash(data, algorithm);
      return hash;
    };
    var sha1 = async (data) => {
      const algorithm = { name: "SHA-1", alias: "sha1" };
      const hash = await createHash(data, algorithm);
      return hash;
    };
    var md5 = async (data) => {
      const algorithm = { name: "MD5", alias: "md5" };
      const hash = await createHash(data, algorithm);
      return hash;
    };
    var createHash = async (data, algorithm) => {
      let sourceBuffer;
      if (ArrayBuffer.isView(data) || data instanceof ArrayBuffer) {
        sourceBuffer = data;
      } else {
        if (typeof data === "object") {
          data = JSON.stringify(data);
        }
        sourceBuffer = new TextEncoder().encode(String(data));
      }
      if (crypto && crypto.subtle) {
        const buffer = await crypto.subtle.digest(
          {
            name: algorithm.name
          },
          sourceBuffer
        );
        const hash = Array.prototype.map.call(new Uint8Array(buffer), (x) => ("00" + x.toString(16)).slice(-2)).join("");
        return hash;
      }
      return null;
    };
  }
});

// node_modules/hono/dist/cjs/utils/buffer.js
var require_buffer = __commonJS({
  "node_modules/hono/dist/cjs/utils/buffer.js"(exports, module) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var buffer_exports = {};
    __export(buffer_exports, {
      bufferToFormData: () => bufferToFormData,
      bufferToString: () => bufferToString,
      equal: () => equal,
      timingSafeEqual: () => timingSafeEqual
    });
    module.exports = __toCommonJS(buffer_exports);
    var import_crypto = require_crypto();
    var equal = (a, b) => {
      if (a === b) {
        return true;
      }
      if (a.byteLength !== b.byteLength) {
        return false;
      }
      const va = new DataView(a);
      const vb = new DataView(b);
      let i = va.byteLength;
      while (i--) {
        if (va.getUint8(i) !== vb.getUint8(i)) {
          return false;
        }
      }
      return true;
    };
    var constantTimeEqualString = (a, b) => {
      const aLen = a.length;
      const bLen = b.length;
      const maxLen = Math.max(aLen, bLen);
      let out = aLen ^ bLen;
      for (let i = 0; i < maxLen; i++) {
        const aChar = i < aLen ? a.charCodeAt(i) : 0;
        const bChar = i < bLen ? b.charCodeAt(i) : 0;
        out |= aChar ^ bChar;
      }
      return out === 0;
    };
    var timingSafeEqualString = async (a, b, hashFunction) => {
      if (!hashFunction) {
        hashFunction = import_crypto.sha256;
      }
      const [sa, sb] = await Promise.all([hashFunction(a), hashFunction(b)]);
      if (sa == null || sb == null || typeof sa !== "string" || typeof sb !== "string") {
        return false;
      }
      const hashEqual = constantTimeEqualString(sa, sb);
      const originalEqual = constantTimeEqualString(a, b);
      return hashEqual && originalEqual;
    };
    var timingSafeEqual = async (a, b, hashFunction) => {
      if (typeof a === "string" && typeof b === "string") {
        return timingSafeEqualString(a, b, hashFunction);
      }
      if (!hashFunction) {
        hashFunction = import_crypto.sha256;
      }
      const [sa, sb] = await Promise.all([hashFunction(a), hashFunction(b)]);
      if (!sa || !sb || typeof sa !== "string" || typeof sb !== "string") {
        return false;
      }
      return timingSafeEqualString(sa, sb);
    };
    var bufferToString = (buffer) => {
      if (buffer instanceof ArrayBuffer) {
        const enc = new TextDecoder("utf-8");
        return enc.decode(buffer);
      }
      return buffer;
    };
    var bufferToFormData = (arrayBuffer, contentType) => {
      const response = new Response(arrayBuffer, {
        headers: {
          // Normalize the media type (case-insensitive) while keeping parameters like the boundary
          "Content-Type": contentType.replace(/^[^;]+/, (mediaType) => mediaType.toLowerCase())
        }
      });
      return response.formData();
    };
  }
});

// node_modules/hono/dist/cjs/utils/body.js
var require_body = __commonJS({
  "node_modules/hono/dist/cjs/utils/body.js"(exports, module) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var body_exports = {};
    __export(body_exports, {
      parseBody: () => parseBody
    });
    module.exports = __toCommonJS(body_exports);
    var import_buffer = require_buffer();
    var isRawRequest = (request) => "headers" in request;
    var parseBody = async (request, options = /* @__PURE__ */ Object.create(null)) => {
      const { all = false, dot = false } = options;
      const headers = isRawRequest(request) ? request.headers : request.raw.headers;
      const contentType = headers.get("Content-Type");
      const mediaType = contentType?.split(";")[0].trim().toLowerCase();
      if (mediaType === "multipart/form-data" || mediaType === "application/x-www-form-urlencoded") {
        return parseFormData(request, { all, dot });
      }
      return {};
    };
    async function parseFormData(request, options) {
      if (!isRawRequest(request) && request.bodyCache.formData) {
        return convertFormDataToBodyData(
          await request.bodyCache.formData,
          options
        );
      }
      const headers = isRawRequest(request) ? request.headers : request.raw.headers;
      const arrayBuffer = await request.arrayBuffer();
      const formDataPromise = (0, import_buffer.bufferToFormData)(arrayBuffer, headers.get("Content-Type") || "");
      if (!isRawRequest(request)) {
        request.bodyCache.formData = formDataPromise;
      }
      const formData = await formDataPromise;
      if (formData) {
        return convertFormDataToBodyData(formData, options);
      }
      return {};
    }
    function convertFormDataToBodyData(formData, options) {
      const form = /* @__PURE__ */ Object.create(null);
      formData.forEach((value, key) => {
        const shouldParseAllValues = options.all || key.endsWith("[]");
        if (!shouldParseAllValues) {
          form[key] = value;
        } else {
          handleParsingAllValues(form, key, value);
        }
      });
      if (options.dot) {
        Object.entries(form).forEach(([key, value]) => {
          const shouldParseDotValues = key.includes(".");
          if (shouldParseDotValues) {
            handleParsingNestedValues(form, key, value);
            delete form[key];
          }
        });
      }
      return form;
    }
    var handleParsingAllValues = (form, key, value) => {
      if (form[key] !== void 0) {
        if (Array.isArray(form[key])) {
          ;
          form[key].push(value);
        } else {
          form[key] = [form[key], value];
        }
      } else {
        if (!key.endsWith("[]")) {
          form[key] = value;
        } else {
          form[key] = [value];
        }
      }
    };
    var handleParsingNestedValues = (form, key, value) => {
      if (/(?:^|\.)__proto__\./.test(key)) {
        return;
      }
      let nestedForm = form;
      const keys = key.split(".");
      keys.forEach((key2, index) => {
        if (index === keys.length - 1) {
          nestedForm[key2] = value;
        } else {
          if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
            nestedForm[key2] = /* @__PURE__ */ Object.create(null);
          }
          nestedForm = nestedForm[key2];
        }
      });
    };
  }
});

// node_modules/hono/dist/cjs/utils/url.js
var require_url = __commonJS({
  "node_modules/hono/dist/cjs/utils/url.js"(exports, module) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var url_exports = {};
    __export(url_exports, {
      checkOptionalParameter: () => checkOptionalParameter,
      decodeURIComponent_: () => decodeURIComponent_,
      getPath: () => getPath,
      getPathNoStrict: () => getPathNoStrict,
      getPattern: () => getPattern,
      getQueryParam: () => getQueryParam,
      getQueryParams: () => getQueryParams,
      getQueryStrings: () => getQueryStrings,
      mergePath: () => mergePath,
      splitPath: () => splitPath,
      splitRoutingPath: () => splitRoutingPath,
      tryDecode: () => tryDecode,
      tryDecodeURI: () => tryDecodeURI,
      tryDecodeURIComponent: () => tryDecodeURIComponent
    });
    module.exports = __toCommonJS(url_exports);
    var splitPath = (path) => {
      const paths = path.split("/");
      if (paths[0] === "") {
        paths.shift();
      }
      return paths;
    };
    var splitRoutingPath = (routePath) => {
      const { groups, path } = extractGroupsFromPath(routePath);
      const paths = splitPath(path);
      return replaceGroupMarks(paths, groups);
    };
    var extractGroupsFromPath = (path) => {
      const groups = [];
      path = path.replace(/\{[^}]+\}/g, (match, index) => {
        const mark = `@${index}`;
        groups.push([mark, match]);
        return mark;
      });
      return { groups, path };
    };
    var replaceGroupMarks = (paths, groups) => {
      for (let i = groups.length - 1; i >= 0; i--) {
        const [mark] = groups[i];
        for (let j = paths.length - 1; j >= 0; j--) {
          if (paths[j].includes(mark)) {
            paths[j] = paths[j].replace(mark, groups[i][1]);
            break;
          }
        }
      }
      return paths;
    };
    var patternCache = {};
    var getPattern = (label, next) => {
      if (label === "*") {
        return "*";
      }
      const match = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
      if (match) {
        const cacheKey = `${label}#${next}`;
        if (!patternCache[cacheKey]) {
          if (match[2]) {
            patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [cacheKey, match[1], new RegExp(`^${match[2]}(?=/${next})`)] : [label, match[1], new RegExp(`^${match[2]}$`)];
          } else {
            patternCache[cacheKey] = [label, match[1], true];
          }
        }
        return patternCache[cacheKey];
      }
      return null;
    };
    var tryDecode = (str, decoder) => {
      try {
        return decoder(str);
      } catch {
        return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match) => {
          try {
            return decoder(match);
          } catch {
            return match;
          }
        });
      }
    };
    var tryDecodeURI = (str) => tryDecode(str, decodeURI);
    var getPath = (request) => {
      const url = request.url;
      const start = url.indexOf("/", url.indexOf(":") + 4);
      let i = start;
      for (; i < url.length; i++) {
        const charCode = url.charCodeAt(i);
        if (charCode === 37) {
          const queryIndex = url.indexOf("?", i);
          const hashIndex = url.indexOf("#", i);
          const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
          const path = url.slice(start, end);
          return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
        } else if (charCode === 63 || charCode === 35) {
          break;
        }
      }
      return url.slice(start, i);
    };
    var getQueryStrings = (url) => {
      const queryIndex = url.indexOf("?", 8);
      return queryIndex === -1 ? "" : "?" + url.slice(queryIndex + 1);
    };
    var getPathNoStrict = (request) => {
      const result = getPath(request);
      return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
    };
    var mergePath = (base, sub, ...rest) => {
      if (rest.length) {
        sub = mergePath(sub, ...rest);
      }
      return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
    };
    var checkOptionalParameter = (path) => {
      if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) {
        return null;
      }
      const segments = path.split("/");
      const results = [];
      let basePath = "";
      segments.forEach((segment) => {
        if (segment !== "" && !/\:/.test(segment)) {
          basePath += "/" + segment;
        } else if (/\:/.test(segment)) {
          if (segment.charCodeAt(segment.length - 1) === 63) {
            if (results.length === 0 && basePath === "") {
              results.push("/");
            } else {
              results.push(basePath);
            }
            const optionalSegment = segment.slice(0, -1);
            basePath += "/" + optionalSegment;
            results.push(basePath);
          } else {
            basePath += "/" + segment;
          }
        }
      });
      return results.filter((v, i, a) => a.indexOf(v) === i);
    };
    var tryDecodeURIComponent = (str) => str.indexOf("%") !== -1 ? tryDecode(str, decodeURIComponent_) : str;
    var _decodeURI = (value) => {
      if (value.indexOf("+") !== -1) {
        value = value.replace(/\+/g, " ");
      }
      return tryDecodeURIComponent(value);
    };
    var _getQueryParam = (url, key, multiple) => {
      let encoded;
      if (!multiple && key && key.indexOf("%") === -1 && key.indexOf("+") === -1) {
        let keyIndex2 = url.indexOf("?", 8);
        if (keyIndex2 === -1) {
          return void 0;
        }
        if (!url.startsWith(key, keyIndex2 + 1)) {
          keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
        }
        while (keyIndex2 !== -1) {
          const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
          if (trailingKeyCode === 61) {
            const valueIndex = keyIndex2 + key.length + 2;
            const endIndex = url.indexOf("&", valueIndex);
            return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
          } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) {
            return "";
          }
          keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
        }
        encoded = /[%+]/.test(url);
        if (!encoded) {
          return void 0;
        }
      }
      const results = /* @__PURE__ */ Object.create(null);
      encoded ??= /[%+]/.test(url);
      let keyIndex = url.indexOf("?", 8);
      while (keyIndex !== -1) {
        const nextKeyIndex = url.indexOf("&", keyIndex + 1);
        let valueIndex = url.indexOf("=", keyIndex);
        if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) {
          valueIndex = -1;
        }
        let name = url.slice(
          keyIndex + 1,
          valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex
        );
        if (encoded) {
          name = _decodeURI(name);
        }
        keyIndex = nextKeyIndex;
        if (name === "") {
          continue;
        }
        let value;
        if (valueIndex === -1) {
          value = "";
        } else {
          value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
          if (encoded) {
            value = _decodeURI(value);
          }
        }
        if (multiple) {
          if (!(results[name] && Array.isArray(results[name]))) {
            results[name] = [];
          }
          ;
          results[name].push(value);
        } else {
          results[name] ??= value;
        }
      }
      return key ? results[key] : results;
    };
    var getQueryParam = _getQueryParam;
    var getQueryParams = (url, key) => {
      return _getQueryParam(url, key, true);
    };
    var decodeURIComponent_ = decodeURIComponent;
  }
});

// node_modules/hono/dist/cjs/request.js
var require_request = __commonJS({
  "node_modules/hono/dist/cjs/request.js"(exports, module) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var request_exports = {};
    __export(request_exports, {
      HonoRequest: () => HonoRequest,
      cloneRawRequest: () => cloneRawRequest
    });
    module.exports = __toCommonJS(request_exports);
    var import_http_exception = require_http_exception();
    var import_constants = require_constants();
    var import_body = require_body();
    var import_url = require_url();
    var HonoRequest = class {
      /**
       * `.raw` can get the raw Request object.
       *
       * @see {@link https://hono.dev/docs/api/request#raw}
       *
       * @example
       * ```ts
       * // For Cloudflare Workers
       * app.post('/', async (c) => {
       *   const metadata = c.req.raw.cf?.hostMetadata?
       *   ...
       * })
       * ```
       */
      raw;
      #validatedData;
      // Short name of validatedData
      #matchResult;
      routeIndex = 0;
      /**
       * `.path` can get the pathname of the request.
       *
       * @see {@link https://hono.dev/docs/api/request#path}
       *
       * @example
       * ```ts
       * app.get('/about/me', (c) => {
       *   const pathname = c.req.path // `/about/me`
       * })
       * ```
       */
      path;
      bodyCache = {};
      constructor(request, path = "/", matchResult = [[]]) {
        this.raw = request;
        this.path = path;
        this.#matchResult = matchResult;
      }
      param(key) {
        return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
      }
      #getDecodedParam(key) {
        const paramKey = this.#matchResult[0][this.routeIndex][1][key];
        const param = this.#getParamValue(paramKey);
        return param && (0, import_url.tryDecodeURIComponent)(param);
      }
      #getAllDecodedParams() {
        const decoded = {};
        const keys = Object.keys(this.#matchResult[0][this.routeIndex][1]);
        for (const key of keys) {
          const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
          if (value !== void 0) {
            decoded[key] = (0, import_url.tryDecodeURIComponent)(value);
          }
        }
        return decoded;
      }
      #getParamValue(paramKey) {
        return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
      }
      query(key) {
        return (0, import_url.getQueryParam)(this.url, key);
      }
      queries(key) {
        return (0, import_url.getQueryParams)(this.url, key);
      }
      header(name) {
        if (name) {
          return this.raw.headers.get(name) ?? void 0;
        }
        const headerData = /* @__PURE__ */ Object.create(null);
        this.raw.headers.forEach((value, key) => {
          headerData[key] = value;
        });
        return headerData;
      }
      async parseBody(options) {
        return (0, import_body.parseBody)(this, options);
      }
      #cachedBody = (key) => {
        const { bodyCache, raw } = this;
        const cachedBody = bodyCache[key];
        if (cachedBody) {
          return cachedBody;
        }
        for (const anyCachedKey in bodyCache) {
          return bodyCache[anyCachedKey].then((body) => {
            if (anyCachedKey === "json") {
              body = JSON.stringify(body);
            }
            return new Response(body)[key]();
          });
        }
        return bodyCache[key] = raw[key]();
      };
      /**
       * `.json()` can parse Request body of type `application/json`
       *
       * @see {@link https://hono.dev/docs/api/request#json}
       *
       * @example
       * ```ts
       * app.post('/entry', async (c) => {
       *   const body = await c.req.json()
       * })
       * ```
       */
      json() {
        return this.#cachedBody("text").then((text) => JSON.parse(text));
      }
      /**
       * `.text()` can parse Request body of type `text/plain`
       *
       * @see {@link https://hono.dev/docs/api/request#text}
       *
       * @example
       * ```ts
       * app.post('/entry', async (c) => {
       *   const body = await c.req.text()
       * })
       * ```
       */
      text() {
        return this.#cachedBody("text");
      }
      /**
       * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
       *
       * @see {@link https://hono.dev/docs/api/request#arraybuffer}
       *
       * @example
       * ```ts
       * app.post('/entry', async (c) => {
       *   const body = await c.req.arrayBuffer()
       * })
       * ```
       */
      arrayBuffer() {
        return this.#cachedBody("arrayBuffer");
      }
      /**
       * `.bytes()` parses the request body as a `Uint8Array`.
       *
       * @see {@link https://hono.dev/docs/api/request#bytes}
       *
       * @example
       * ```ts
       * app.post('/entry', async (c) => {
       *   const body = await c.req.bytes()
       * })
       * ```
       */
      bytes() {
        return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
      }
      /**
       * Parses the request body as a `Blob`.
       * @example
       * ```ts
       * app.post('/entry', async (c) => {
       *   const body = await c.req.blob();
       * });
       * ```
       * @see https://hono.dev/docs/api/request#blob
       */
      blob() {
        return this.#cachedBody("blob");
      }
      /**
       * Parses the request body as `FormData`.
       * @example
       * ```ts
       * app.post('/entry', async (c) => {
       *   const body = await c.req.formData();
       * });
       * ```
       * @see https://hono.dev/docs/api/request#formdata
       */
      formData() {
        return this.#cachedBody("formData");
      }
      /**
       * Adds validated data to the request.
       *
       * @param target - The target of the validation.
       * @param data - The validated data to add.
       */
      addValidatedData(target, data) {
        ;
        (this.#validatedData ??= {})[target] = data;
      }
      valid(target) {
        return this.#validatedData?.[target];
      }
      /**
       * `.url()` can get the request url strings.
       *
       * @see {@link https://hono.dev/docs/api/request#url}
       *
       * @example
       * ```ts
       * app.get('/about/me', (c) => {
       *   const url = c.req.url // `http://localhost:8787/about/me`
       *   ...
       * })
       * ```
       */
      get url() {
        return this.raw.url;
      }
      /**
       * `.method()` can get the method name of the request.
       *
       * @see {@link https://hono.dev/docs/api/request#method}
       *
       * @example
       * ```ts
       * app.get('/about/me', (c) => {
       *   const method = c.req.method // `GET`
       * })
       * ```
       */
      get method() {
        return this.raw.method;
      }
      get [import_constants.GET_MATCH_RESULT]() {
        return this.#matchResult;
      }
      /**
       * `.matchedRoutes()` can return a matched route in the handler
       *
       * @deprecated
       *
       * Use matchedRoutes helper defined in "hono/route" instead.
       *
       * @see {@link https://hono.dev/docs/api/request#matchedroutes}
       *
       * @example
       * ```ts
       * app.use('*', async function logger(c, next) {
       *   await next()
       *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
       *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
       *     console.log(
       *       method,
       *       ' ',
       *       path,
       *       ' '.repeat(Math.max(10 - path.length, 0)),
       *       name,
       *       i === c.req.routeIndex ? '<- respond from here' : ''
       *     )
       *   })
       * })
       * ```
       */
      get matchedRoutes() {
        return this.#matchResult[0].map(([[, route]]) => route);
      }
      /**
       * `routePath()` can retrieve the path registered within the handler
       *
       * @deprecated
       *
       * Use routePath helper defined in "hono/route" instead.
       *
       * @see {@link https://hono.dev/docs/api/request#routepath}
       *
       * @example
       * ```ts
       * app.get('/posts/:id', (c) => {
       *   return c.json({ path: c.req.routePath })
       * })
       * ```
       */
      get routePath() {
        return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
      }
    };
    var cloneRawRequest = async (req) => {
      if (!req.raw.bodyUsed) {
        return req.raw.clone();
      }
      const cacheKey = Object.keys(req.bodyCache)[0];
      if (!cacheKey) {
        throw new import_http_exception.HTTPException(500, {
          message: "Cannot clone request: body was already consumed and not cached. Please use HonoRequest methods (e.g., req.json(), req.text()) instead of consuming req.raw directly."
        });
      }
      const body = await req[cacheKey]();
      const headers = req.header();
      if (body instanceof FormData) {
        delete headers["content-type"];
      }
      const requestInit = {
        body,
        cache: req.raw.cache,
        credentials: req.raw.credentials,
        headers,
        integrity: req.raw.integrity,
        keepalive: req.raw.keepalive,
        method: req.method,
        mode: req.raw.mode,
        redirect: req.raw.redirect,
        referrer: req.raw.referrer,
        referrerPolicy: req.raw.referrerPolicy,
        signal: req.raw.signal
      };
      return new Request(req.url, requestInit);
    };
  }
});

// node_modules/hono/dist/cjs/utils/html.js
var require_html = __commonJS({
  "node_modules/hono/dist/cjs/utils/html.js"(exports, module) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var html_exports = {};
    __export(html_exports, {
      HtmlEscapedCallbackPhase: () => HtmlEscapedCallbackPhase,
      escapeToBuffer: () => escapeToBuffer,
      raw: () => raw,
      resolveCallback: () => resolveCallback,
      resolveCallbackSync: () => resolveCallbackSync,
      stringBufferToString: () => stringBufferToString
    });
    module.exports = __toCommonJS(html_exports);
    var HtmlEscapedCallbackPhase = {
      Stringify: 1,
      BeforeStream: 2,
      Stream: 3
    };
    var raw = (value, callbacks) => {
      const escapedString = new String(value);
      escapedString.isEscaped = true;
      escapedString.callbacks = callbacks;
      return escapedString;
    };
    var escapeRe = /[&<>'"]/;
    var stringBufferToString = async (buffer, callbacks) => {
      let str = "";
      callbacks ||= [];
      const resolvedBuffer = await Promise.all(buffer);
      for (let i = resolvedBuffer.length - 1; ; i--) {
        str += resolvedBuffer[i];
        i--;
        if (i < 0) {
          break;
        }
        let r = resolvedBuffer[i];
        if (typeof r === "object") {
          callbacks.push(...r.callbacks || []);
        }
        const isEscaped = r.isEscaped;
        r = await (typeof r === "object" ? r.toString() : r);
        if (typeof r === "object") {
          callbacks.push(...r.callbacks || []);
        }
        if (r.isEscaped ?? isEscaped) {
          str += r;
        } else {
          const buf = [str];
          escapeToBuffer(r, buf);
          str = buf[0];
        }
      }
      return raw(str, callbacks);
    };
    var escapeToBuffer = (str, buffer) => {
      const match = str.search(escapeRe);
      if (match === -1) {
        buffer[0] += str;
        return;
      }
      let escape;
      let index;
      let lastIndex = 0;
      for (index = match; index < str.length; index++) {
        switch (str.charCodeAt(index)) {
          case 34:
            escape = "&quot;";
            break;
          case 39:
            escape = "&#39;";
            break;
          case 38:
            escape = "&amp;";
            break;
          case 60:
            escape = "&lt;";
            break;
          case 62:
            escape = "&gt;";
            break;
          default:
            continue;
        }
        buffer[0] += str.substring(lastIndex, index) + escape;
        lastIndex = index + 1;
      }
      buffer[0] += str.substring(lastIndex, index);
    };
    var resolveCallbackSync = (str) => {
      const callbacks = str.callbacks;
      if (!callbacks?.length) {
        return str;
      }
      const buffer = [str];
      const context = {};
      callbacks.forEach((c) => c({ phase: HtmlEscapedCallbackPhase.Stringify, buffer, context }));
      return buffer[0];
    };
    var resolveCallback = async (str, phase, preserveCallbacks, context, buffer) => {
      if (typeof str === "object" && !(str instanceof String)) {
        if (!(str instanceof Promise)) {
          str = str.toString();
        }
        if (str instanceof Promise) {
          str = await str;
        }
      }
      const callbacks = str.callbacks;
      if (!callbacks?.length) {
        return Promise.resolve(str);
      }
      if (buffer) {
        buffer[0] += str;
      } else {
        buffer = [str];
      }
      const resStr = Promise.all(callbacks.map((c) => c({ phase, buffer, context }))).then(
        (res) => Promise.all(
          res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context, buffer))
        ).then(() => buffer[0])
      );
      if (preserveCallbacks) {
        return raw(await resStr, callbacks);
      } else {
        return resStr;
      }
    };
  }
});

// node_modules/hono/dist/cjs/context.js
var require_context = __commonJS({
  "node_modules/hono/dist/cjs/context.js"(exports, module) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var context_exports = {};
    __export(context_exports, {
      Context: () => Context2,
      TEXT_PLAIN: () => TEXT_PLAIN
    });
    module.exports = __toCommonJS(context_exports);
    var import_request = require_request();
    var import_html = require_html();
    var TEXT_PLAIN = "text/plain; charset=UTF-8";
    var setDefaultContentType = (contentType, headers) => {
      return {
        "Content-Type": contentType,
        ...headers
      };
    };
    var createResponseInstance = (body, init) => new Response(body, init);
    var Context2 = class {
      #rawRequest;
      #req;
      /**
       * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
       *
       * @see {@link https://hono.dev/docs/api/context#env}
       *
       * @example
       * ```ts
       * // Environment object for Cloudflare Workers
       * app.get('*', async c => {
       *   const counter = c.env.COUNTER
       * })
       * ```
       */
      env = {};
      #var;
      finalized = false;
      /**
       * `.error` can get the error object from the middleware if the Handler throws an error.
       *
       * @see {@link https://hono.dev/docs/api/context#error}
       *
       * @example
       * ```ts
       * app.use('*', async (c, next) => {
       *   await next()
       *   if (c.error) {
       *     // do something...
       *   }
       * })
       * ```
       */
      error;
      #status;
      #executionCtx;
      #res;
      #layout;
      #renderer;
      #notFoundHandler;
      #preparedHeaders;
      #matchResult;
      #path;
      /**
       * Creates an instance of the Context class.
       *
       * @param req - The Request object.
       * @param options - Optional configuration options for the context.
       */
      constructor(req, options) {
        this.#rawRequest = req;
        if (options) {
          this.#executionCtx = options.executionCtx;
          this.env = options.env;
          this.#notFoundHandler = options.notFoundHandler;
          this.#path = options.path;
          this.#matchResult = options.matchResult;
        }
      }
      /**
       * `.req` is the instance of {@link HonoRequest}.
       */
      get req() {
        this.#req ??= new import_request.HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
        return this.#req;
      }
      /**
       * @see {@link https://hono.dev/docs/api/context#event}
       * The FetchEvent associated with the current request.
       *
       * @throws Will throw an error if the context does not have a FetchEvent.
       */
      get event() {
        if (this.#executionCtx && "respondWith" in this.#executionCtx) {
          return this.#executionCtx;
        } else {
          throw Error("This context has no FetchEvent");
        }
      }
      /**
       * @see {@link https://hono.dev/docs/api/context#executionctx}
       * The ExecutionContext associated with the current request.
       *
       * @throws Will throw an error if the context does not have an ExecutionContext.
       */
      get executionCtx() {
        if (this.#executionCtx) {
          return this.#executionCtx;
        } else {
          throw Error("This context has no ExecutionContext");
        }
      }
      /**
       * @see {@link https://hono.dev/docs/api/context#res}
       * The Response object for the current request.
       */
      get res() {
        return this.#res ||= createResponseInstance(null, {
          headers: this.#preparedHeaders ??= new Headers()
        });
      }
      /**
       * Sets the Response object for the current request.
       *
       * @param _res - The Response object to set.
       */
      set res(_res) {
        if (this.#res && _res) {
          _res = createResponseInstance(_res.body, _res);
          for (const [k, v] of this.#res.headers.entries()) {
            if (k === "content-type") {
              continue;
            }
            if (k === "set-cookie") {
              const cookies = this.#res.headers.getSetCookie();
              _res.headers.delete("set-cookie");
              for (const cookie of cookies) {
                _res.headers.append("set-cookie", cookie);
              }
            } else {
              _res.headers.set(k, v);
            }
          }
        }
        this.#res = _res;
        this.finalized = true;
      }
      /**
       * `.render()` can create a response within a layout.
       *
       * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
       *
       * @example
       * ```ts
       * app.get('/', (c) => {
       *   return c.render('Hello!')
       * })
       * ```
       */
      render = (...args) => {
        this.#renderer ??= (content) => this.html(content);
        return this.#renderer(...args);
      };
      /**
       * Sets the layout for the response.
       *
       * @param layout - The layout to set.
       * @returns The layout function.
       */
      setLayout = (layout) => this.#layout = layout;
      /**
       * Gets the current layout for the response.
       *
       * @returns The current layout function.
       */
      getLayout = () => this.#layout;
      /**
       * `.setRenderer()` can set the layout in the custom middleware.
       *
       * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
       *
       * @example
       * ```tsx
       * app.use('*', async (c, next) => {
       *   c.setRenderer((content) => {
       *     return c.html(
       *       <html>
       *         <body>
       *           <p>{content}</p>
       *         </body>
       *       </html>
       *     )
       *   })
       *   await next()
       * })
       * ```
       */
      setRenderer = (renderer) => {
        this.#renderer = renderer;
      };
      /**
       * `.header()` can set headers.
       *
       * @see {@link https://hono.dev/docs/api/context#header}
       *
       * @example
       * ```ts
       * app.get('/welcome', (c) => {
       *   // Set headers
       *   c.header('X-Message', 'Hello!')
       *   c.header('Content-Type', 'text/plain')
       *
       *   // Append multiple headers using the append option (e.g. Vary)
       *   c.header('Vary', 'Accept-Encoding', { append: true })
       *   c.header('Vary', 'User-Agent', { append: true })
       *
       *   return c.body('Thank you for coming')
       * })
       * ```
       */
      header = (name, value, options) => {
        if (this.finalized) {
          this.#res = createResponseInstance(this.#res.body, this.#res);
        }
        const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
        if (value === void 0) {
          headers.delete(name);
        } else if (options?.append) {
          headers.append(name, value);
        } else {
          headers.set(name, value);
        }
      };
      status = (status) => {
        this.#status = status;
      };
      /**
       * `.set()` can set the value specified by the key.
       *
       * @see {@link https://hono.dev/docs/api/context#set-get}
       *
       * @example
       * ```ts
       * app.use('*', async (c, next) => {
       *   c.set('message', 'Hono is hot!!')
       *   await next()
       * })
       * ```
       */
      set = (key, value) => {
        this.#var ??= /* @__PURE__ */ new Map();
        this.#var.set(key, value);
      };
      /**
       * `.get()` can use the value specified by the key.
       *
       * @see {@link https://hono.dev/docs/api/context#set-get}
       *
       * @example
       * ```ts
       * app.get('/', (c) => {
       *   const message = c.get('message')
       *   return c.text(`The message is "${message}"`)
       * })
       * ```
       */
      get = (key) => {
        return this.#var ? this.#var.get(key) : void 0;
      };
      /**
       * `.var` can access the value of a variable.
       *
       * @see {@link https://hono.dev/docs/api/context#var}
       *
       * @example
       * ```ts
       * const result = c.var.client.oneMethod()
       * ```
       */
      // c.var.propName is a read-only
      get var() {
        if (!this.#var) {
          return {};
        }
        return Object.fromEntries(this.#var);
      }
      #newResponse(data, arg, headers) {
        let responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders;
        if (typeof arg === "object" && arg.headers) {
          responseHeaders ??= new Headers();
          for (const [key, value] of new Headers(arg.headers)) {
            if (key === "set-cookie") {
              responseHeaders.append(key, value);
            } else {
              responseHeaders.set(key, value);
            }
          }
        }
        if (headers) {
          if (!responseHeaders) {
            let count = 0;
            for (const k in headers) {
              if (++count > 1 || typeof headers[k] !== "string") {
                responseHeaders = new Headers();
                break;
              }
            }
          }
          if (responseHeaders) {
            for (const k in headers) {
              const v = headers[k];
              if (typeof v === "string") {
                responseHeaders.set(k, v);
              } else {
                responseHeaders.delete(k);
                for (const v2 of v) {
                  responseHeaders.append(k, v2);
                }
              }
            }
          }
        }
        const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
        return createResponseInstance(data, {
          status,
          headers: responseHeaders ?? headers
        });
      }
      newResponse = (...args) => this.#newResponse(...args);
      /**
       * `.body()` can return the HTTP response.
       * You can set headers with `.header()` and set HTTP status code with `.status`.
       * This can also be set in `.text()`, `.json()` and so on.
       *
       * @see {@link https://hono.dev/docs/api/context#body}
       *
       * @example
       * ```ts
       * app.get('/welcome', (c) => {
       *   // Set headers
       *   c.header('X-Message', 'Hello!')
       *   c.header('Content-Type', 'text/plain')
       *   // Set HTTP status code
       *   c.status(201)
       *
       *   // Return the response body
       *   return c.body('Thank you for coming')
       * })
       * ```
       */
      body = (data, arg, headers) => this.#newResponse(data, arg, headers);
      /**
       * `.text()` can render text as `Content-Type:text/plain`.
       *
       * @see {@link https://hono.dev/docs/api/context#text}
       *
       * @example
       * ```ts
       * app.get('/say', (c) => {
       *   return c.text('Hello!')
       * })
       * ```
       */
      text = (text, arg, headers) => {
        return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(
          text,
          arg,
          setDefaultContentType(TEXT_PLAIN, headers)
        );
      };
      /**
       * `.json()` can render JSON as `Content-Type:application/json`.
       *
       * @see {@link https://hono.dev/docs/api/context#json}
       *
       * @example
       * ```ts
       * app.get('/api', (c) => {
       *   return c.json({ message: 'Hello!' })
       * })
       * ```
       */
      json = (object, arg, headers) => {
        return this.#newResponse(
          JSON.stringify(object),
          arg,
          setDefaultContentType("application/json", headers)
        );
      };
      html = (html, arg, headers) => {
        const res = (html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers));
        return typeof html === "object" ? (0, import_html.resolveCallback)(html, import_html.HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
      };
      /**
       * `.redirect()` can Redirect, default status code is 302.
       *
       * @see {@link https://hono.dev/docs/api/context#redirect}
       *
       * @example
       * ```ts
       * app.get('/redirect', (c) => {
       *   return c.redirect('/')
       * })
       * app.get('/redirect-permanently', (c) => {
       *   return c.redirect('/', 301)
       * })
       * ```
       */
      redirect = (location, status) => {
        const locationString = String(location);
        this.header(
          "Location",
          // Multibyes should be encoded
          // eslint-disable-next-line no-control-regex
          !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString)
        );
        return this.newResponse(null, status ?? 302);
      };
      /**
       * `.notFound()` can return the Not Found Response.
       *
       * @see {@link https://hono.dev/docs/api/context#notfound}
       *
       * @example
       * ```ts
       * app.get('/notfound', (c) => {
       *   return c.notFound()
       * })
       * ```
       */
      notFound = () => {
        this.#notFoundHandler ??= () => createResponseInstance();
        return this.#notFoundHandler(this);
      };
    };
  }
});

// node_modules/hono/dist/cjs/router.js
var require_router = __commonJS({
  "node_modules/hono/dist/cjs/router.js"(exports, module) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var router_exports = {};
    __export(router_exports, {
      MESSAGE_MATCHER_IS_ALREADY_BUILT: () => MESSAGE_MATCHER_IS_ALREADY_BUILT,
      METHODS: () => METHODS,
      METHOD_NAME_ALL: () => METHOD_NAME_ALL,
      METHOD_NAME_ALL_LOWERCASE: () => METHOD_NAME_ALL_LOWERCASE,
      UnsupportedPathError: () => UnsupportedPathError
    });
    module.exports = __toCommonJS(router_exports);
    var METHOD_NAME_ALL = "ALL";
    var METHOD_NAME_ALL_LOWERCASE = "all";
    var METHODS = ["get", "post", "put", "delete", "options", "patch", "query"];
    var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
    var UnsupportedPathError = class extends Error {
    };
  }
});

// node_modules/hono/dist/cjs/utils/constants.js
var require_constants2 = __commonJS({
  "node_modules/hono/dist/cjs/utils/constants.js"(exports, module) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var constants_exports = {};
    __export(constants_exports, {
      COMPOSED_HANDLER: () => COMPOSED_HANDLER
    });
    module.exports = __toCommonJS(constants_exports);
    var COMPOSED_HANDLER = "__COMPOSED_HANDLER";
  }
});

// node_modules/hono/dist/cjs/hono-base.js
var require_hono_base = __commonJS({
  "node_modules/hono/dist/cjs/hono-base.js"(exports, module) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var hono_base_exports = {};
    __export(hono_base_exports, {
      HonoBase: () => Hono2
    });
    module.exports = __toCommonJS(hono_base_exports);
    var import_compose = require_compose();
    var import_context = require_context();
    var import_router = require_router();
    var import_constants = require_constants2();
    var import_url = require_url();
    var notFoundHandler = (c) => {
      return c.text("404 Not Found", 404);
    };
    var errorHandler = (err, c) => {
      if ("getResponse" in err) {
        const res = err.getResponse();
        return c.newResponse(res.body, res);
      }
      console.error(err);
      return c.text("Internal Server Error", 500);
    };
    var Hono2 = class _Hono {
      get;
      post;
      put;
      delete;
      options;
      patch;
      query;
      all;
      on;
      use;
      /*
        This class is like an abstract class and does not have a router.
        To use it, inherit the class and implement router in the constructor.
      */
      router;
      getPath;
      // Cannot use `#` because it requires visibility at JavaScript runtime.
      _basePath = "/";
      #path = "/";
      routes = [];
      constructor(options = {}) {
        const allMethods = [...import_router.METHODS, import_router.METHOD_NAME_ALL_LOWERCASE];
        allMethods.forEach((method) => {
          this[method] = (args1, ...args) => {
            if (typeof args1 === "string") {
              this.#path = args1;
            } else {
              this.#addRoute(method, this.#path, args1);
            }
            args.forEach((handler) => {
              this.#addRoute(method, this.#path, handler);
            });
            return this;
          };
        });
        this.on = (method, path, ...handlers) => {
          for (const p of [path].flat()) {
            this.#path = p;
            for (const m of [method].flat()) {
              handlers.map((handler) => {
                this.#addRoute(m.toUpperCase(), this.#path, handler);
              });
            }
          }
          return this;
        };
        this.use = (arg1, ...handlers) => {
          if (typeof arg1 === "string") {
            this.#path = arg1;
          } else {
            this.#path = "*";
            handlers.unshift(arg1);
          }
          handlers.forEach((handler) => {
            this.#addRoute(import_router.METHOD_NAME_ALL, this.#path, handler);
          });
          return this;
        };
        const { strict, ...optionsWithoutStrict } = options;
        Object.assign(this, optionsWithoutStrict);
        this.getPath = strict ?? true ? options.getPath ?? import_url.getPath : import_url.getPathNoStrict;
      }
      #clone() {
        const clone = new _Hono({
          router: this.router,
          getPath: this.getPath
        });
        clone.errorHandler = this.errorHandler;
        clone.#notFoundHandler = this.#notFoundHandler;
        clone.routes = this.routes;
        return clone;
      }
      #notFoundHandler = notFoundHandler;
      // Cannot use `#` because it requires visibility at JavaScript runtime.
      errorHandler = errorHandler;
      /**
       * `.route()` allows grouping other Hono instance in routes.
       *
       * @see {@link https://hono.dev/docs/api/routing#grouping}
       *
       * @param {string} path - base Path
       * @param {Hono} app - other Hono instance
       * @returns {Hono} routed Hono instance
       *
       * @example
       * ```ts
       * const app = new Hono()
       * const app2 = new Hono()
       *
       * app2.get("/user", (c) => c.text("user"))
       * app.route("/api", app2) // GET /api/user
       * ```
       */
      route(path, app) {
        const subApp = this.basePath(path);
        app.routes.map((r) => {
          let handler;
          if (app.errorHandler === errorHandler) {
            handler = r.handler;
          } else {
            handler = async (c, next) => (await (0, import_compose.compose)([], app.errorHandler)(c, () => r.handler(c, next))).res;
            handler[import_constants.COMPOSED_HANDLER] = r.handler;
          }
          subApp.#addRoute(r.method, r.path, handler, r.basePath);
        });
        return this;
      }
      /**
       * `.basePath()` allows base paths to be specified.
       *
       * @see {@link https://hono.dev/docs/api/routing#base-path}
       *
       * @param {string} path - base Path
       * @returns {Hono} changed Hono instance
       *
       * @example
       * ```ts
       * const api = new Hono().basePath('/api')
       * ```
       */
      basePath(path) {
        const subApp = this.#clone();
        subApp._basePath = (0, import_url.mergePath)(this._basePath, path);
        return subApp;
      }
      /**
       * `.onError()` handles an error and returns a customized Response.
       *
       * @see {@link https://hono.dev/docs/api/hono#error-handling}
       *
       * @param {ErrorHandler} handler - request Handler for error
       * @returns {Hono} changed Hono instance
       *
       * @example
       * ```ts
       * app.onError((err, c) => {
       *   console.error(`${err}`)
       *   return c.text('Custom Error Message', 500)
       * })
       * ```
       */
      onError = (handler) => {
        this.errorHandler = handler;
        return this;
      };
      /**
       * `.notFound()` allows you to customize a Not Found Response.
       *
       * @see {@link https://hono.dev/docs/api/hono#not-found}
       *
       * @param {NotFoundHandler} handler - request handler for not-found
       * @returns {Hono} changed Hono instance
       *
       * @example
       * ```ts
       * app.notFound((c) => {
       *   return c.text('Custom 404 Message', 404)
       * })
       * ```
       */
      notFound = (handler) => {
        this.#notFoundHandler = handler;
        return this;
      };
      /**
       * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
       *
       * @see {@link https://hono.dev/docs/api/hono#mount}
       *
       * @param {string} path - base Path
       * @param {Function} applicationHandler - other Request Handler
       * @param {MountOptions} [options] - options of `.mount()`
       * @returns {Hono} mounted Hono instance
       *
       * @example
       * ```ts
       * import { Router as IttyRouter } from 'itty-router'
       * import { Hono } from 'hono'
       * // Create itty-router application
       * const ittyRouter = IttyRouter()
       * // GET /itty-router/hello
       * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
       *
       * const app = new Hono()
       * app.mount('/itty-router', ittyRouter.handle)
       * ```
       *
       * @example
       * ```ts
       * const app = new Hono()
       * // Send the request to another application without modification.
       * app.mount('/app', anotherApp, {
       *   replaceRequest: (req) => req,
       * })
       * ```
       */
      mount(path, applicationHandler, options) {
        let replaceRequest;
        let optionHandler;
        if (options) {
          if (typeof options === "function") {
            optionHandler = options;
          } else {
            optionHandler = options.optionHandler;
            if (options.replaceRequest === false) {
              replaceRequest = (request) => request;
            } else {
              replaceRequest = options.replaceRequest;
            }
          }
        }
        const getOptions = optionHandler ? (c) => {
          const options2 = optionHandler(c);
          return Array.isArray(options2) ? options2 : [options2];
        } : (c) => {
          let executionContext = void 0;
          try {
            executionContext = c.executionCtx;
          } catch {
          }
          return [c.env, executionContext];
        };
        replaceRequest ||= (() => {
          const mergedPath = (0, import_url.mergePath)(this._basePath, path);
          const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
          return (request) => {
            const url = new URL(request.url);
            url.pathname = this.getPath(request).slice(pathPrefixLength) || "/";
            return new Request(url, request);
          };
        })();
        const handler = async (c, next) => {
          const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
          if (res) {
            return res;
          }
          await next();
        };
        this.#addRoute(import_router.METHOD_NAME_ALL, (0, import_url.mergePath)(path, "*"), handler);
        return this;
      }
      #addRoute(method, path, handler, baseRoutePath) {
        method = method.toUpperCase();
        path = (0, import_url.mergePath)(this._basePath, path);
        const r = {
          basePath: baseRoutePath !== void 0 ? (0, import_url.mergePath)(this._basePath, baseRoutePath) : this._basePath,
          path,
          method,
          handler
        };
        this.router.add(method, path, [handler, r]);
        this.routes.push(r);
      }
      #handleError(err, c) {
        if (err instanceof Error) {
          return this.errorHandler(err, c);
        }
        throw err;
      }
      #dispatch(request, executionCtx, env, method) {
        if (method === "HEAD") {
          return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
        }
        const path = this.getPath(request, { env });
        const matchResult = this.router.match(method, path);
        const c = new import_context.Context(request, {
          path,
          matchResult,
          env,
          executionCtx,
          notFoundHandler: this.#notFoundHandler
        });
        if (matchResult[0].length === 1) {
          let res;
          try {
            res = matchResult[0][0][0][0](c, async () => {
              c.res = await this.#notFoundHandler(c);
            });
          } catch (err) {
            return this.#handleError(err, c);
          }
          return res instanceof Promise ? res.then(
            (resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))
          ).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
        }
        const composed = (0, import_compose.compose)(matchResult[0], this.errorHandler, this.#notFoundHandler);
        return (async () => {
          try {
            const context = await composed(c);
            if (!context.finalized) {
              throw new Error(
                "Context is not finalized. Did you forget to return a Response object or `await next()`?"
              );
            }
            return context.res;
          } catch (err) {
            return this.#handleError(err, c);
          }
        })();
      }
      /**
       * `.fetch()` will be entry point of your app.
       *
       * @see {@link https://hono.dev/docs/api/hono#fetch}
       *
       * @param {Request} request - request Object of request
       * @param {Env} env - env Object
       * @param {ExecutionContext} executionCtx - context of execution
       * @returns {Response | Promise<Response>} response of request
       *
       */
      fetch = (request, ...rest) => {
        return this.#dispatch(request, rest[1], rest[0], request.method);
      };
      /**
       * `.request()` is a useful method for testing.
       * You can pass a URL or pathname to send a GET request.
       * app will return a Response object.
       * ```ts
       * test('GET /hello is ok', async () => {
       *   const res = await app.request('/hello')
       *   expect(res.status).toBe(200)
       * })
       * ```
       * @see https://hono.dev/docs/api/hono#request
       */
      request = (input, requestInit, Env, executionCtx) => {
        if (input instanceof Request) {
          return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
        }
        input = input.toString();
        return this.fetch(
          new Request(
            /^https?:\/\//.test(input) ? input : `http://localhost${(0, import_url.mergePath)("/", input)}`,
            requestInit
          ),
          Env,
          executionCtx
        );
      };
      /**
       * `.fire()` automatically adds a global fetch event listener.
       * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
       * @deprecated
       * Use `fire` from `hono/service-worker` instead.
       * ```ts
       * import { Hono } from 'hono'
       * import { fire } from 'hono/service-worker'
       *
       * const app = new Hono()
       * // ...
       * fire(app)
       * ```
       * @see https://hono.dev/docs/api/hono#fire
       * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
       * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
       */
      fire = () => {
        addEventListener("fetch", (event) => {
          event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
        });
      };
    };
  }
});

// node_modules/hono/dist/cjs/router/reg-exp-router/matcher.js
var require_matcher = __commonJS({
  "node_modules/hono/dist/cjs/router/reg-exp-router/matcher.js"(exports, module) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var matcher_exports = {};
    __export(matcher_exports, {
      emptyParam: () => emptyParam,
      match: () => match
    });
    module.exports = __toCommonJS(matcher_exports);
    var import_router = require_router();
    var emptyParam = [];
    function match(method, path) {
      const matchers = this.buildAllMatchers();
      const match2 = ((method2, path2) => {
        const matcher = matchers[method2] || matchers[import_router.METHOD_NAME_ALL];
        const staticMatch = matcher[2][path2];
        if (staticMatch) {
          return staticMatch;
        }
        const match3 = path2.match(matcher[0]);
        if (!match3) {
          return [[], emptyParam];
        }
        const index = match3.indexOf("", 1);
        return [matcher[1][index], match3];
      });
      this.match = match2;
      return match2(method, path);
    }
  }
});

// node_modules/hono/dist/cjs/router/reg-exp-router/node.js
var require_node = __commonJS({
  "node_modules/hono/dist/cjs/router/reg-exp-router/node.js"(exports, module) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var node_exports = {};
    __export(node_exports, {
      Node: () => Node,
      PATH_ERROR: () => PATH_ERROR
    });
    module.exports = __toCommonJS(node_exports);
    var LABEL_REG_EXP_STR = "[^/]+";
    var ONLY_WILDCARD_REG_EXP_STR = ".*";
    var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
    var PATH_ERROR = /* @__PURE__ */ Symbol();
    var regExpMetaChars = new Set(".\\+*[^]$()");
    function compareKey(a, b) {
      if (a.length === 1) {
        return b.length === 1 ? a < b ? -1 : 1 : -1;
      }
      if (b.length === 1) {
        return 1;
      }
      if (a === ONLY_WILDCARD_REG_EXP_STR || a === TAIL_WILDCARD_REG_EXP_STR) {
        return b === TAIL_WILDCARD_REG_EXP_STR ? -1 : 1;
      } else if (b === ONLY_WILDCARD_REG_EXP_STR || b === TAIL_WILDCARD_REG_EXP_STR) {
        return -1;
      }
      if (a === LABEL_REG_EXP_STR) {
        return 1;
      } else if (b === LABEL_REG_EXP_STR) {
        return -1;
      }
      return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
    }
    var Node = class _Node {
      // handler index of a dynamic path, or -1 for a static path terminal
      #index;
      #varIndex;
      #children = /* @__PURE__ */ Object.create(null);
      insert(tokens, index, paramMap, context, isStatic) {
        let node = this;
        for (let i = 0, len = tokens.length; i < len; i++) {
          const token = tokens[i];
          const pattern = token.length === 1 ? token === "*" ? i === len - 1 ? ["", "", ONLY_WILDCARD_REG_EXP_STR] : ["", "", LABEL_REG_EXP_STR] : null : token === "/*" ? ["", "", TAIL_WILDCARD_REG_EXP_STR] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
          let nextNode;
          if (pattern) {
            const name = pattern[1];
            let regexpStr = pattern[2] || LABEL_REG_EXP_STR;
            if (name && pattern[2]) {
              if (regexpStr === ".*") {
                throw PATH_ERROR;
              }
              regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
              if (/\((?!\?:)/.test(regexpStr)) {
                throw PATH_ERROR;
              }
              if (regexpStr.length === 1 && regExpMetaChars.has(regexpStr)) {
                throw PATH_ERROR;
              }
            }
            nextNode = node.#children[regexpStr];
            if (!nextNode) {
              if (regexpStr !== ONLY_WILDCARD_REG_EXP_STR && regexpStr !== TAIL_WILDCARD_REG_EXP_STR) {
                for (const k in node.#children) {
                  if (
                    // a single-char pattern coexists with single-char literals as a literal does
                    (regexpStr.length > 1 || k.length > 1) && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
                  ) {
                    throw PATH_ERROR;
                  }
                }
              }
              nextNode = node.#children[regexpStr] = new _Node();
            }
            if (name !== "") {
              nextNode.#varIndex ??= context.varIndex++;
              paramMap.push([name, nextNode.#varIndex]);
            }
          } else {
            nextNode = node.#children[token];
            if (!nextNode) {
              for (const k in node.#children) {
                if (k.length > 1 && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR) {
                  throw PATH_ERROR;
                }
              }
              nextNode = node.#children[token] = new _Node();
            }
          }
          node = nextNode;
        }
        if (node.#index !== void 0) {
          throw PATH_ERROR;
        }
        node.#index = isStatic ? -1 : index;
      }
      buildRegExpStr() {
        const childKeys = Object.keys(this.#children).sort(compareKey);
        const strList = childKeys.map((k) => {
          const c = this.#children[k];
          const childStr = c.buildRegExpStr();
          return childStr === "" ? "" : (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + childStr;
        }).filter(Boolean);
        if (typeof this.#index === "number" && this.#index !== -1) {
          strList.unshift(`#${this.#index}`);
        }
        if (strList.length === 0) {
          return "";
        }
        if (strList.length === 1) {
          return strList[0];
        }
        return "(?:" + strList.join("|") + ")";
      }
    };
  }
});

// node_modules/hono/dist/cjs/router/reg-exp-router/trie.js
var require_trie = __commonJS({
  "node_modules/hono/dist/cjs/router/reg-exp-router/trie.js"(exports, module) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var trie_exports = {};
    __export(trie_exports, {
      Trie: () => Trie
    });
    module.exports = __toCommonJS(trie_exports);
    var import_node = require_node();
    var Trie = class {
      #context = { varIndex: 0 };
      #root = new import_node.Node();
      #index = 0;
      // dynamic path -> [handler index, param assoc]; static paths are not registered
      paths = /* @__PURE__ */ Object.create(null);
      insert(path, isStatic) {
        if (isStatic) {
          this.#root.insert(path.split(""), 0, [], this.#context, true);
          return;
        }
        const paramAssoc = [];
        const groups = [];
        let markedPath = path;
        for (let i = 0; ; ) {
          let replaced = false;
          markedPath = markedPath.replace(/\{[^}]+\}/g, (m) => {
            const mark = `@\\${i}`;
            groups[i] = [mark, m];
            i++;
            replaced = true;
            return mark;
          });
          if (!replaced) {
            break;
          }
        }
        const tokens = markedPath.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
        for (let i = groups.length - 1; i >= 0; i--) {
          const [mark] = groups[i];
          for (let j = tokens.length - 1; j >= 0; j--) {
            if (tokens[j].indexOf(mark) !== -1) {
              tokens[j] = tokens[j].replace(mark, groups[i][1]);
              break;
            }
          }
        }
        this.#root.insert(tokens, this.#index, paramAssoc, this.#context, false);
        this.paths[path] = [this.#index++, paramAssoc];
      }
      buildRegExp() {
        let regexp = this.#root.buildRegExpStr();
        if (regexp === "") {
          return [/^$/, [], []];
        }
        let captureIndex = 0;
        const indexReplacementMap = [];
        const paramReplacementMap = [];
        regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
          if (handlerIndex !== void 0) {
            indexReplacementMap[++captureIndex] = Number(handlerIndex);
            return "$()";
          }
          if (paramIndex !== void 0) {
            paramReplacementMap[Number(paramIndex)] = ++captureIndex;
            return "";
          }
          return "";
        });
        return [new RegExp(`^${regexp}`), indexReplacementMap, paramReplacementMap];
      }
    };
  }
});

// node_modules/hono/dist/cjs/router/reg-exp-router/router.js
var require_router2 = __commonJS({
  "node_modules/hono/dist/cjs/router/reg-exp-router/router.js"(exports, module) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var router_exports = {};
    __export(router_exports, {
      RegExpRouter: () => RegExpRouter2
    });
    module.exports = __toCommonJS(router_exports);
    var import_router = require_router();
    var import_url = require_url();
    var import_matcher = require_matcher();
    var import_node = require_node();
    var import_trie = require_trie();
    var wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
    function buildWildcardRegExp(path) {
      return wildcardRegExpCache[path] ??= new RegExp(
        path === "*" ? "" : `^${path.replace(
          /\/\*$|([.\\+*[^\]$()])/g,
          (_, metaChar) => metaChar ? `\\${metaChar}` : "(?:|/.*)"
        )}$`
      );
    }
    function clearWildcardRegExpCache() {
      wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
    }
    function findMiddleware(middleware, path) {
      if (!middleware) {
        return void 0;
      }
      for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) {
        if (buildWildcardRegExp(k).test(path)) {
          return [...middleware[k]];
        }
      }
      return void 0;
    }
    var RegExpRouter2 = class {
      name = "RegExpRouter";
      #middleware;
      #routes;
      #tries;
      constructor() {
        this.#middleware = { [import_router.METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
        this.#routes = { [import_router.METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
        this.#tries = { [import_router.METHOD_NAME_ALL]: new import_trie.Trie() };
      }
      #insertPath(method, path) {
        try {
          this.#tries[method].insert(path, !/\*|\/:/.test(path));
        } catch (e) {
          throw e === import_node.PATH_ERROR ? new import_router.UnsupportedPathError(path) : e;
        }
      }
      add(method, path, handler) {
        const middleware = this.#middleware;
        const routes = this.#routes;
        if (!middleware || !routes) {
          throw new Error(import_router.MESSAGE_MATCHER_IS_ALREADY_BUILT);
        }
        if (!middleware[method]) {
          this.#tries[method] = new import_trie.Trie();
          [middleware, routes].forEach((handlerMap) => {
            handlerMap[method] = /* @__PURE__ */ Object.create(null);
            Object.keys(handlerMap[import_router.METHOD_NAME_ALL]).forEach((p) => {
              handlerMap[method][p] = [...handlerMap[import_router.METHOD_NAME_ALL][p]];
              this.#insertPath(method, p);
            });
          });
        }
        if (path === "/*") {
          path = "*";
        }
        const paramCount = (path.match(/\/:/g) || []).length;
        if (/\*$/.test(path)) {
          const re = buildWildcardRegExp(path);
          Object.keys(middleware).forEach((m) => {
            if ((method === import_router.METHOD_NAME_ALL || method === m) && !middleware[m][path]) {
              this.#insertPath(m, path);
              middleware[m][path] = findMiddleware(middleware[m], path) || findMiddleware(middleware[import_router.METHOD_NAME_ALL], path) || [];
            }
          });
          Object.keys(middleware).forEach((m) => {
            if (method === import_router.METHOD_NAME_ALL || method === m) {
              Object.keys(middleware[m]).forEach((p) => {
                re.test(p) && middleware[m][p].push([handler, paramCount]);
              });
            }
          });
          Object.keys(routes).forEach((m) => {
            if (method === import_router.METHOD_NAME_ALL || method === m) {
              Object.keys(routes[m]).forEach(
                (p) => re.test(p) && routes[m][p].push([handler, paramCount])
              );
            }
          });
          return;
        }
        const paths = (0, import_url.checkOptionalParameter)(path) || [path];
        for (let i = 0, len = paths.length; i < len; i++) {
          const path2 = paths[i];
          Object.keys(routes).forEach((m) => {
            if (method === import_router.METHOD_NAME_ALL || method === m) {
              if (!routes[m][path2]) {
                this.#insertPath(m, path2);
                routes[m][path2] = [
                  ...findMiddleware(middleware[m], path2) || findMiddleware(middleware[import_router.METHOD_NAME_ALL], path2) || []
                ];
              }
              routes[m][path2].push([handler, paramCount - len + i + 1]);
            }
          });
        }
      }
      match = import_matcher.match;
      buildAllMatchers() {
        const matchers = /* @__PURE__ */ Object.create(null);
        Object.keys(this.#routes).concat(Object.keys(this.#middleware)).forEach((method) => {
          matchers[method] ||= this.#buildMatcher(method);
        });
        this.#middleware = this.#routes = this.#tries = void 0;
        clearWildcardRegExpCache();
        return matchers;
      }
      #buildMatcher(method) {
        const middleware = this.#middleware[method];
        const routes = this.#routes[method];
        const trie = this.#tries[method];
        const staticMap = /* @__PURE__ */ Object.create(null);
        const handlerData = [];
        [middleware, routes].forEach((r) => {
          for (const path in r) {
            const handlers = r[path];
            const pathData = trie.paths[path];
            if (!pathData) {
              staticMap[path] = [handlers.map(([h]) => [h, /* @__PURE__ */ Object.create(null)]), import_matcher.emptyParam];
              continue;
            }
            const paramAssoc = pathData[1];
            handlerData[pathData[0]] = handlers.map(([h, paramCount]) => {
              const paramIndexMap = /* @__PURE__ */ Object.create(null);
              paramCount -= 1;
              for (; paramCount >= 0; paramCount--) {
                const [key, value] = paramAssoc[paramCount];
                paramIndexMap[key] = value;
              }
              return [h, paramIndexMap];
            });
          }
        });
        const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
        for (let i = 0, len = handlerData.length; i < len; i++) {
          for (let j = 0, len2 = handlerData[i].length; j < len2; j++) {
            const map = handlerData[i][j]?.[1];
            if (!map) {
              continue;
            }
            const keys = Object.keys(map);
            for (let k = 0, len3 = keys.length; k < len3; k++) {
              map[keys[k]] = paramReplacementMap[map[keys[k]]];
            }
          }
        }
        const handlerMap = [];
        for (const i in indexReplacementMap) {
          handlerMap[i] = handlerData[indexReplacementMap[i]];
        }
        return [regexp, handlerMap, staticMap];
      }
    };
  }
});

// node_modules/hono/dist/cjs/router/reg-exp-router/prepared-router.js
var require_prepared_router = __commonJS({
  "node_modules/hono/dist/cjs/router/reg-exp-router/prepared-router.js"(exports, module) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var prepared_router_exports = {};
    __export(prepared_router_exports, {
      PreparedRegExpRouter: () => PreparedRegExpRouter2,
      buildInitParams: () => buildInitParams2,
      serializeInitParams: () => serializeInitParams2
    });
    module.exports = __toCommonJS(prepared_router_exports);
    var import_router = require_router();
    var import_matcher = require_matcher();
    var import_router2 = require_router2();
    var PreparedRegExpRouter2 = class {
      name = "PreparedRegExpRouter";
      #matchers;
      #relocateMap;
      constructor(matchers, relocateMap) {
        this.#matchers = matchers;
        this.#relocateMap = relocateMap;
      }
      #addWildcard(method, handlerData) {
        const matcher = this.#matchers[method];
        matcher[1].forEach((list) => list && list.push(handlerData));
        Object.values(matcher[2]).forEach((list) => list[0].push(handlerData));
      }
      #addPath(method, path, handler, indexes, map) {
        const matcher = this.#matchers[method];
        if (!map) {
          matcher[2][path][0].push([handler, {}]);
        } else {
          indexes.forEach((index) => {
            if (typeof index === "number") {
              matcher[1][index].push([handler, map]);
            } else {
              ;
              matcher[2][index || path][0].push([handler, map]);
            }
          });
        }
      }
      add(method, path, handler) {
        if (!this.#matchers[method]) {
          const all = this.#matchers[import_router.METHOD_NAME_ALL];
          const staticMap = {};
          for (const key in all[2]) {
            staticMap[key] = [all[2][key][0].slice(), import_matcher.emptyParam];
          }
          this.#matchers[method] = [
            all[0],
            all[1].map((list) => Array.isArray(list) ? list.slice() : 0),
            staticMap
          ];
        }
        if (path === "/*" || path === "*") {
          const handlerData = [handler, {}];
          if (method === import_router.METHOD_NAME_ALL) {
            for (const m in this.#matchers) {
              this.#addWildcard(m, handlerData);
            }
          } else {
            this.#addWildcard(method, handlerData);
          }
          return;
        }
        const data = this.#relocateMap[path];
        if (!data) {
          throw new Error(`Path ${path} is not registered`);
        }
        for (const [indexes, map] of data) {
          if (method === import_router.METHOD_NAME_ALL) {
            for (const m in this.#matchers) {
              this.#addPath(m, path, handler, indexes, map);
            }
          } else {
            this.#addPath(method, path, handler, indexes, map);
          }
        }
      }
      buildAllMatchers() {
        return this.#matchers;
      }
      match = import_matcher.match;
    };
    var buildInitParams2 = ({ paths }) => {
      const RegExpRouterWithMatcherExport = class extends import_router2.RegExpRouter {
        buildAndExportAllMatchers() {
          return this.buildAllMatchers();
        }
      };
      const router = new RegExpRouterWithMatcherExport();
      for (const path of paths) {
        router.add(import_router.METHOD_NAME_ALL, path, path);
      }
      const matchers = router.buildAndExportAllMatchers();
      const all = matchers[import_router.METHOD_NAME_ALL];
      const relocateMap = {};
      for (const path of paths) {
        if (path === "/*" || path === "*") {
          continue;
        }
        all[1].forEach((list, i) => {
          list.forEach(([p, map]) => {
            if (p === path) {
              if (relocateMap[path]) {
                relocateMap[path][0][1] = {
                  ...relocateMap[path][0][1],
                  ...map
                };
              } else {
                relocateMap[path] = [[[], map]];
              }
              if (relocateMap[path][0][0].findIndex((j) => j === i) === -1) {
                relocateMap[path][0][0].push(i);
              }
            }
          });
        });
        for (const path2 in all[2]) {
          all[2][path2][0].forEach(([p]) => {
            if (p === path) {
              relocateMap[path] ||= [[[]]];
              const value = path2 === path ? "" : path2;
              if (relocateMap[path][0][0].findIndex((v) => v === value) === -1) {
                relocateMap[path][0][0].push(value);
              }
            }
          });
        }
      }
      for (let i = 0, len = all[1].length; i < len; i++) {
        all[1][i] = all[1][i] ? [] : 0;
      }
      for (const path in all[2]) {
        all[2][path][0] = [];
      }
      return [matchers, relocateMap];
    };
    var serializeInitParams2 = ([matchers, relocateMap]) => {
      const matchersStr = JSON.stringify(
        matchers,
        (_, value) => value instanceof RegExp ? `##${value.toString()}##` : value
      ).replace(/"##(.+?)##"/g, (_, str) => str.replace(/\\\\/g, "\\"));
      const relocateMapStr = JSON.stringify(relocateMap);
      return `[${matchersStr},${relocateMapStr}]`;
    };
  }
});

// node_modules/hono/dist/cjs/router/reg-exp-router/index.js
var require_reg_exp_router = __commonJS({
  "node_modules/hono/dist/cjs/router/reg-exp-router/index.js"(exports, module) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var reg_exp_router_exports = {};
    __export(reg_exp_router_exports, {
      PreparedRegExpRouter: () => import_prepared_router.PreparedRegExpRouter,
      RegExpRouter: () => import_router.RegExpRouter,
      buildInitParams: () => import_prepared_router.buildInitParams,
      serializeInitParams: () => import_prepared_router.serializeInitParams
    });
    module.exports = __toCommonJS(reg_exp_router_exports);
    var import_router = require_router2();
    var import_prepared_router = require_prepared_router();
  }
});

// node_modules/hono/dist/cjs/router/smart-router/router.js
var require_router3 = __commonJS({
  "node_modules/hono/dist/cjs/router/smart-router/router.js"(exports, module) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var router_exports = {};
    __export(router_exports, {
      SmartRouter: () => SmartRouter2
    });
    module.exports = __toCommonJS(router_exports);
    var import_router = require_router();
    var SmartRouter2 = class {
      name = "SmartRouter";
      #routers = [];
      #routes = [];
      constructor(init) {
        this.#routers = init.routers;
      }
      add(method, path, handler) {
        if (!this.#routes) {
          throw new Error(import_router.MESSAGE_MATCHER_IS_ALREADY_BUILT);
        }
        this.#routes.push([method, path, handler]);
      }
      match(method, path) {
        if (!this.#routes) {
          throw new Error("Fatal error");
        }
        const routers = this.#routers;
        const routes = this.#routes;
        const len = routers.length;
        let i = 0;
        let res;
        for (; i < len; i++) {
          const router = routers[i];
          try {
            for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) {
              router.add(...routes[i2]);
            }
            res = router.match(method, path);
          } catch (e) {
            if (e instanceof import_router.UnsupportedPathError) {
              continue;
            }
            throw e;
          }
          this.match = router.match.bind(router);
          this.#routers = [router];
          this.#routes = void 0;
          break;
        }
        if (i === len) {
          throw new Error("Fatal error");
        }
        this.name = `SmartRouter + ${this.activeRouter.name}`;
        return res;
      }
      get activeRouter() {
        if (this.#routes || this.#routers.length !== 1) {
          throw new Error("No active router has been determined yet.");
        }
        return this.#routers[0];
      }
    };
  }
});

// node_modules/hono/dist/cjs/router/smart-router/index.js
var require_smart_router = __commonJS({
  "node_modules/hono/dist/cjs/router/smart-router/index.js"(exports, module) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var smart_router_exports = {};
    __export(smart_router_exports, {
      SmartRouter: () => import_router.SmartRouter
    });
    module.exports = __toCommonJS(smart_router_exports);
    var import_router = require_router3();
  }
});

// node_modules/hono/dist/cjs/router/trie-router/node.js
var require_node2 = __commonJS({
  "node_modules/hono/dist/cjs/router/trie-router/node.js"(exports, module) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var node_exports = {};
    __export(node_exports, {
      Node: () => Node
    });
    module.exports = __toCommonJS(node_exports);
    var import_router = require_router();
    var import_url = require_url();
    var emptyParams = /* @__PURE__ */ Object.create(null);
    var order = 0;
    var Node = class _Node {
      #methods = [];
      #children = /* @__PURE__ */ Object.create(null);
      #patterns = [];
      #pattern;
      #params = emptyParams;
      insert(method, path, handler) {
        let curNode = this;
        const parts = (0, import_url.splitRoutingPath)(path);
        const possibleKeys = /* @__PURE__ */ new Set();
        let i = 0;
        for (const p of parts) {
          const nextP = parts[++i];
          const pattern = (0, import_url.getPattern)(p, nextP) || (nextP === void 0 && p && p.indexOf("*") === p.length - 1 ? p : null);
          const isParam = Array.isArray(pattern);
          const key = isParam ? pattern[0] : pattern || p;
          const child = curNode.#children[key] ||= new _Node();
          if (pattern && !child.#pattern) {
            child.#pattern = pattern;
            curNode.#patterns.push(child);
          }
          curNode = child;
          if (isParam) {
            possibleKeys.add(pattern[1]);
          }
        }
        curNode.#methods.push({
          [method]: {
            handler,
            possibleKeys: [...possibleKeys],
            score: ++order
          }
        });
      }
      #pushHandlerSets(handlerSets, node, method, nodeParams, params) {
        for (let i = 0, len = node.#methods.length; i < len; i++) {
          const m = node.#methods[i];
          const handlerSet = m[method] || m[import_router.METHOD_NAME_ALL];
          if (handlerSet) {
            handlerSet.params = /* @__PURE__ */ Object.create(null);
            handlerSets.push(handlerSet);
            for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
              const key = handlerSet.possibleKeys[i2];
              handlerSet.params[key] = params?.[key] && !i2 ? params[key] : nodeParams[key] ?? params?.[key];
            }
          }
        }
      }
      search(method, path) {
        const handlerSets = [];
        this.#params = emptyParams;
        const curNode = this;
        let curNodes = [curNode];
        const parts = (0, import_url.splitPath)(path);
        const curNodesQueue = [];
        const len = parts.length;
        let partOffsets = null;
        for (let i = 0; i < len; i++) {
          const part = parts[i];
          const isLast = i === len - 1;
          const tempNodes = [];
          for (let j = 0, len2 = curNodes.length; j < len2; j++) {
            const node = curNodes[j];
            const nextNode = node.#children[part];
            if (nextNode) {
              nextNode.#params = node.#params;
              if (isLast) {
                if (nextNode.#children["*"]) {
                  this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
                }
                this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
              } else {
                tempNodes.push(nextNode);
              }
            }
            for (const child of node.#patterns) {
              const pattern = child.#pattern;
              const params = node.#params === emptyParams ? {} : { ...node.#params };
              if (typeof pattern === "string") {
                if (pattern === "*" || part.startsWith(pattern.slice(0, -1))) {
                  this.#pushHandlerSets(handlerSets, child, method, node.#params);
                  if (pattern === "*") {
                    child.#params = params;
                    tempNodes.push(child);
                  }
                }
                continue;
              }
              const [, name, matcher] = pattern;
              if (!part && matcher === true) {
                continue;
              }
              if (matcher !== true) {
                if (!partOffsets) {
                  partOffsets = [];
                  let offset = path[0] === "/" ? 1 : 0;
                  for (let p = 0; p < len; p++) {
                    partOffsets[p] = offset;
                    offset += parts[p].length + 1;
                  }
                }
                const restPathString = path.slice(partOffsets[i]);
                const m = matcher.exec(restPathString);
                if (m) {
                  params[name] = m[0];
                  this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
                  if (m[0].length === restPathString.length && child.#children["*"]) {
                    this.#pushHandlerSets(
                      handlerSets,
                      child.#children["*"],
                      method,
                      node.#params,
                      params
                    );
                  }
                  for (const _ in child.#children) {
                    child.#params = params;
                    const componentCount = m[0].match(/\//g)?.length ?? 0;
                    const targetCurNodes = curNodesQueue[componentCount] ||= [];
                    targetCurNodes.push(child);
                    break;
                  }
                  continue;
                }
              }
              if (matcher === true || matcher.test(part)) {
                params[name] = part;
                if (isLast) {
                  this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
                  if (child.#children["*"]) {
                    this.#pushHandlerSets(
                      handlerSets,
                      child.#children["*"],
                      method,
                      params,
                      node.#params
                    );
                  }
                } else {
                  child.#params = params;
                  tempNodes.push(child);
                }
              }
            }
          }
          const shifted = curNodesQueue.shift();
          curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
        }
        if (handlerSets[1]) {
          handlerSets.sort((a, b) => {
            return a.score - b.score;
          });
        }
        return [handlerSets.map(({ handler, params }) => [handler, params])];
      }
    };
  }
});

// node_modules/hono/dist/cjs/router/trie-router/router.js
var require_router4 = __commonJS({
  "node_modules/hono/dist/cjs/router/trie-router/router.js"(exports, module) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var router_exports = {};
    __export(router_exports, {
      TrieRouter: () => TrieRouter2
    });
    module.exports = __toCommonJS(router_exports);
    var import_url = require_url();
    var import_node = require_node2();
    var TrieRouter2 = class {
      name = "TrieRouter";
      #node = new import_node.Node();
      add(method, path, handler) {
        for (const result of (0, import_url.checkOptionalParameter)(path) || [path]) {
          this.#node.insert(method, result, handler);
        }
      }
      match(method, path) {
        return this.#node.search(method, path);
      }
    };
  }
});

// node_modules/hono/dist/cjs/router/trie-router/index.js
var require_trie_router = __commonJS({
  "node_modules/hono/dist/cjs/router/trie-router/index.js"(exports, module) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var trie_router_exports = {};
    __export(trie_router_exports, {
      TrieRouter: () => import_router.TrieRouter
    });
    module.exports = __toCommonJS(trie_router_exports);
    var import_router = require_router4();
  }
});

// node_modules/hono/dist/cjs/hono.js
var require_hono = __commonJS({
  "node_modules/hono/dist/cjs/hono.js"(exports, module) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var hono_exports = {};
    __export(hono_exports, {
      Hono: () => Hono2
    });
    module.exports = __toCommonJS(hono_exports);
    var import_hono_base = require_hono_base();
    var import_reg_exp_router = require_reg_exp_router();
    var import_smart_router = require_smart_router();
    var import_trie_router = require_trie_router();
    var Hono2 = class extends import_hono_base.HonoBase {
      /**
       * Creates an instance of the Hono class.
       *
       * @param options - Optional configuration options for the Hono instance.
       */
      constructor(options = {}) {
        super(options);
        this.router = options.router ?? new import_smart_router.SmartRouter({
          routers: [new import_reg_exp_router.RegExpRouter(), new import_trie_router.TrieRouter()]
        });
      }
    };
  }
});

// node_modules/hono/dist/cjs/index.js
var require_cjs = __commonJS({
  "node_modules/hono/dist/cjs/index.js"(exports, module) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var index_exports = {};
    __export(index_exports, {
      Context: () => import_context.Context,
      Hono: () => import_hono.Hono
    });
    module.exports = __toCommonJS(index_exports);
    var import_hono = require_hono();
    var import_context = require_context();
  }
});

// node_modules/hono/dist/cjs/middleware/body-limit/index.js
var require_body_limit = __commonJS({
  "node_modules/hono/dist/cjs/middleware/body-limit/index.js"(exports, module) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var body_limit_exports = {};
    __export(body_limit_exports, {
      bodyLimit: () => bodyLimit
    });
    module.exports = __toCommonJS(body_limit_exports);
    var import_http_exception = require_http_exception();
    var ERROR_MESSAGE = "Payload Too Large";
    var bodyLimit = (options) => {
      const onError = options.onError || (() => {
        const res = new Response(ERROR_MESSAGE, {
          status: 413
        });
        throw new import_http_exception.HTTPException(413, { res });
      });
      const maxSize = options.maxSize;
      return async function bodyLimit2(c, next) {
        if (!c.req.raw.body) {
          return next();
        }
        const hasTransferEncoding = c.req.raw.headers.has("transfer-encoding");
        const hasContentLength = c.req.raw.headers.has("content-length");
        if (hasContentLength && !hasTransferEncoding) {
          const contentLength = parseInt(c.req.raw.headers.get("content-length") || "0", 10);
          return contentLength > maxSize ? onError(c) : next();
        }
        let size = 0;
        const chunks = [];
        const rawReader = c.req.raw.body.getReader();
        for (; ; ) {
          const { done, value } = await rawReader.read();
          if (done) {
            break;
          }
          size += value.length;
          if (size > maxSize) {
            return onError(c);
          }
          chunks.push(value);
        }
        const requestInit = {
          body: new ReadableStream({
            start(controller) {
              for (const chunk of chunks) {
                controller.enqueue(chunk);
              }
              controller.close();
            }
          }),
          duplex: "half"
        };
        c.req.raw = new Request(c.req.raw, requestInit);
        return next();
      };
    };
  }
});

// node_modules/hono/dist/cjs/utils/cookie.js
var require_cookie = __commonJS({
  "node_modules/hono/dist/cjs/utils/cookie.js"(exports, module) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var cookie_exports = {};
    __export(cookie_exports, {
      parse: () => parse,
      parseSigned: () => parseSigned,
      serialize: () => serialize,
      serializeSigned: () => serializeSigned
    });
    module.exports = __toCommonJS(cookie_exports);
    var import_url = require_url();
    var algorithm = { name: "HMAC", hash: "SHA-256" };
    var getCryptoKey = async (secret) => {
      const secretBuf = typeof secret === "string" ? new TextEncoder().encode(secret) : secret;
      return await crypto.subtle.importKey("raw", secretBuf, algorithm, false, ["sign", "verify"]);
    };
    var makeSignature = async (value, secret) => {
      const key = await getCryptoKey(secret);
      const signature = await crypto.subtle.sign(algorithm.name, key, new TextEncoder().encode(value));
      return btoa(String.fromCharCode(...new Uint8Array(signature)));
    };
    var verifySignature = async (base64Signature, value, secret) => {
      try {
        const signatureBinStr = atob(base64Signature);
        const signature = new Uint8Array(signatureBinStr.length);
        for (let i = 0, len = signatureBinStr.length; i < len; i++) {
          signature[i] = signatureBinStr.charCodeAt(i);
        }
        return await crypto.subtle.verify(algorithm, secret, signature, new TextEncoder().encode(value));
      } catch {
        return false;
      }
    };
    var validCookieNameRegEx = /^[\w!#$%&'*.^`|~+-]+$/;
    var relaxedCookieNameRegEx = /^[!#-:<>-[\]-~]+$/;
    var validCookieValueRegEx = /^[ !#-:<-[\]-~]*$/;
    var trimCookieWhitespace = (value) => {
      let start = 0;
      let end = value.length;
      while (start < end) {
        const charCode = value.charCodeAt(start);
        if (charCode !== 32 && charCode !== 9) {
          break;
        }
        start++;
      }
      while (end > start) {
        const charCode = value.charCodeAt(end - 1);
        if (charCode !== 32 && charCode !== 9) {
          break;
        }
        end--;
      }
      return start === 0 && end === value.length ? value : value.slice(start, end);
    };
    var parse = (cookie, name) => {
      if (name && cookie.indexOf(name) === -1) {
        return {};
      }
      const pairs = cookie.split(";");
      const parsedCookie = /* @__PURE__ */ Object.create(null);
      for (const pairStr of pairs) {
        const valueStartPos = pairStr.indexOf("=");
        if (valueStartPos === -1) {
          continue;
        }
        const cookieName = trimCookieWhitespace(pairStr.substring(0, valueStartPos));
        if (name && name !== cookieName || !relaxedCookieNameRegEx.test(cookieName) || cookieName in parsedCookie) {
          continue;
        }
        let cookieValue = trimCookieWhitespace(pairStr.substring(valueStartPos + 1));
        if (cookieValue.startsWith('"') && cookieValue.endsWith('"')) {
          cookieValue = cookieValue.slice(1, -1);
        }
        if (validCookieValueRegEx.test(cookieValue)) {
          parsedCookie[cookieName] = (0, import_url.tryDecodeURIComponent)(cookieValue);
          if (name) {
            break;
          }
        }
      }
      return parsedCookie;
    };
    var parseSigned = async (cookie, secret, name) => {
      const parsedCookie = /* @__PURE__ */ Object.create(null);
      const secretKey = await getCryptoKey(secret);
      for (const [key, value] of Object.entries(parse(cookie, name))) {
        const signatureStartPos = value.lastIndexOf(".");
        if (signatureStartPos < 1) {
          continue;
        }
        const signedValue = value.substring(0, signatureStartPos);
        const signature = value.substring(signatureStartPos + 1);
        if (signature.length !== 44 || !signature.endsWith("=")) {
          continue;
        }
        const isVerified = await verifySignature(signature, signedValue, secretKey);
        parsedCookie[key] = isVerified ? signedValue : false;
      }
      return parsedCookie;
    };
    var _serialize = (name, value, opt = {}) => {
      if (!validCookieNameRegEx.test(name)) {
        throw new Error("Invalid cookie name");
      }
      let cookie = `${name}=${value}`;
      if (name.startsWith("__Secure-") && !opt.secure) {
        throw new Error("__Secure- Cookie must have Secure attributes");
      }
      if (name.startsWith("__Host-")) {
        if (!opt.secure) {
          throw new Error("__Host- Cookie must have Secure attributes");
        }
        if (opt.path !== "/") {
          throw new Error('__Host- Cookie must have Path attributes with "/"');
        }
        if (opt.domain) {
          throw new Error("__Host- Cookie must not have Domain attributes");
        }
      }
      for (const key of ["domain", "path", "sameSite", "priority"]) {
        if (opt[key] && /[;\r\n]/.test(opt[key])) {
          throw new Error(`${key} must not contain ";", "\\r", or "\\n"`);
        }
      }
      if (opt && typeof opt.maxAge === "number" && opt.maxAge >= 0) {
        if (opt.maxAge > 3456e4) {
          throw new Error(
            "Cookies Max-Age SHOULD NOT be greater than 400 days (34560000 seconds) in duration."
          );
        }
        cookie += `; Max-Age=${opt.maxAge | 0}`;
      }
      if (opt.domain && opt.prefix !== "host") {
        cookie += `; Domain=${opt.domain}`;
      }
      if (opt.path) {
        cookie += `; Path=${opt.path}`;
      }
      if (opt.expires) {
        if (opt.expires.getTime() - Date.now() > 3456e7) {
          throw new Error(
            "Cookies Expires SHOULD NOT be greater than 400 days (34560000 seconds) in the future."
          );
        }
        cookie += `; Expires=${opt.expires.toUTCString()}`;
      }
      if (opt.httpOnly) {
        cookie += "; HttpOnly";
      }
      if (opt.secure) {
        cookie += "; Secure";
      }
      if (opt.sameSite) {
        cookie += `; SameSite=${opt.sameSite.charAt(0).toUpperCase() + opt.sameSite.slice(1)}`;
      }
      if (opt.priority) {
        cookie += `; Priority=${opt.priority.charAt(0).toUpperCase() + opt.priority.slice(1)}`;
      }
      if (opt.partitioned) {
        if (!opt.secure) {
          throw new Error("Partitioned Cookie must have Secure attributes");
        }
        cookie += "; Partitioned";
      }
      return cookie;
    };
    var serialize = (name, value, opt) => {
      value = encodeURIComponent(value);
      return _serialize(name, value, opt);
    };
    var serializeSigned = async (name, value, secret, opt = {}) => {
      const signature = await makeSignature(value, secret);
      value = `${value}.${signature}`;
      value = encodeURIComponent(value);
      return _serialize(name, value, opt);
    };
  }
});

// node_modules/hono/dist/cjs/helper/cookie/index.js
var require_cookie2 = __commonJS({
  "node_modules/hono/dist/cjs/helper/cookie/index.js"(exports, module) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var cookie_exports = {};
    __export(cookie_exports, {
      deleteCookie: () => deleteCookie,
      generateCookie: () => generateCookie,
      generateSignedCookie: () => generateSignedCookie,
      getCookie: () => getCookie,
      getSignedCookie: () => getSignedCookie,
      setCookie: () => setCookie,
      setSignedCookie: () => setSignedCookie
    });
    module.exports = __toCommonJS(cookie_exports);
    var import_cookie = require_cookie();
    var getCookie = (c, key, prefix) => {
      const cookie = c.req.raw.headers.get("Cookie");
      if (typeof key === "string") {
        if (!cookie) {
          return void 0;
        }
        let finalKey = key;
        if (prefix === "secure") {
          finalKey = "__Secure-" + key;
        } else if (prefix === "host") {
          finalKey = "__Host-" + key;
        }
        const obj2 = (0, import_cookie.parse)(cookie, finalKey);
        return obj2[finalKey];
      }
      if (!cookie) {
        return {};
      }
      const obj = (0, import_cookie.parse)(cookie);
      return obj;
    };
    var getSignedCookie = async (c, secret, key, prefix) => {
      const cookie = c.req.raw.headers.get("Cookie");
      if (typeof key === "string") {
        if (!cookie) {
          return void 0;
        }
        let finalKey = key;
        if (prefix === "secure") {
          finalKey = "__Secure-" + key;
        } else if (prefix === "host") {
          finalKey = "__Host-" + key;
        }
        const obj2 = await (0, import_cookie.parseSigned)(cookie, secret, finalKey);
        return obj2[finalKey];
      }
      if (!cookie) {
        return {};
      }
      const obj = await (0, import_cookie.parseSigned)(cookie, secret);
      return obj;
    };
    var generateCookie = (name, value, opt) => {
      let cookie;
      if (opt?.prefix === "secure") {
        cookie = (0, import_cookie.serialize)("__Secure-" + name, value, { path: "/", ...opt, secure: true });
      } else if (opt?.prefix === "host") {
        cookie = (0, import_cookie.serialize)("__Host-" + name, value, {
          ...opt,
          path: "/",
          secure: true,
          domain: void 0
        });
      } else {
        cookie = (0, import_cookie.serialize)(name, value, { path: "/", ...opt });
      }
      return cookie;
    };
    var setCookie = (c, name, value, opt) => {
      const cookie = generateCookie(name, value, opt);
      c.header("Set-Cookie", cookie, { append: true });
    };
    var generateSignedCookie = async (name, value, secret, opt) => {
      let cookie;
      if (opt?.prefix === "secure") {
        cookie = await (0, import_cookie.serializeSigned)("__Secure-" + name, value, secret, {
          path: "/",
          ...opt,
          secure: true
        });
      } else if (opt?.prefix === "host") {
        cookie = await (0, import_cookie.serializeSigned)("__Host-" + name, value, secret, {
          ...opt,
          path: "/",
          secure: true,
          domain: void 0
        });
      } else {
        cookie = await (0, import_cookie.serializeSigned)(name, value, secret, { path: "/", ...opt });
      }
      return cookie;
    };
    var setSignedCookie = async (c, name, value, secret, opt) => {
      const cookie = await generateSignedCookie(name, value, secret, opt);
      c.header("set-cookie", cookie, { append: true });
    };
    var deleteCookie = (c, name, opt) => {
      const deletedCookie = getCookie(c, name, opt?.prefix);
      setCookie(c, name, "", { ...opt, maxAge: 0 });
      return deletedCookie;
    };
  }
});

// src/crypto.js
var require_crypto2 = __commonJS({
  "src/crypto.js"(exports, module) {
    "use strict";
    var subtle = globalThis.crypto.subtle;
    var encoder = new TextEncoder();
    var DEFAULT_ITERATIONS = 1e5;
    function iterations() {
      const raw = Number(globalThis.PBKDF2_ITERATIONS_OVERRIDE);
      return Number.isFinite(raw) && raw >= 1e3 ? Math.floor(raw) : DEFAULT_ITERATIONS;
    }
    function toB64(bytes) {
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    }
    function fromB64(value) {
      const binary = atob(value);
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
      return out;
    }
    function toHex(bytes) {
      let hex = "";
      for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
      return hex;
    }
    function randomBytes(length) {
      return globalThis.crypto.getRandomValues(new Uint8Array(length));
    }
    function newToken(bytes = 32) {
      return toHex(randomBytes(bytes));
    }
    async function derive(password, salt, rounds) {
      const key = await subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
      const bits = await subtle.deriveBits(
        { name: "PBKDF2", hash: "SHA-256", salt, iterations: rounds },
        key,
        256
      );
      return new Uint8Array(bits);
    }
    async function hashPassword(password) {
      const rounds = iterations();
      const salt = randomBytes(16);
      const hash = await derive(password, salt, rounds);
      return `pbkdf2$${rounds}$${toB64(salt)}$${toB64(hash)}`;
    }
    function timingSafeEqualBytes(a, b) {
      const length = Math.max(a.length, b.length);
      let diff = a.length ^ b.length;
      for (let i = 0; i < length; i += 1) {
        diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
      }
      return diff === 0;
    }
    async function verifyPassword(password, stored) {
      try {
        const parts = String(stored).split("$");
        if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
        const rounds = Number(parts[1]);
        if (!Number.isFinite(rounds) || rounds < 1e3) return false;
        const salt = fromB64(parts[2]);
        const expected = fromB64(parts[3]);
        const actual = await derive(password, salt, rounds);
        return timingSafeEqualBytes(actual, expected);
      } catch {
        return false;
      }
    }
    async function sha256hex(value) {
      const digest = await subtle.digest("SHA-256", encoder.encode(String(value)));
      return toHex(new Uint8Array(digest));
    }
    async function hmacHex(secret, message) {
      const key = await subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const signature = await subtle.sign("HMAC", key, encoder.encode(message));
      return toHex(new Uint8Array(signature));
    }
    function safeEqual(a, b) {
      return timingSafeEqualBytes(encoder.encode(String(a)), encoder.encode(String(b)));
    }
    module.exports = {
      newToken,
      randomBytes,
      toHex,
      hashPassword,
      verifyPassword,
      sha256hex,
      hmacHex,
      safeEqual,
      timingSafeEqualBytes
    };
  }
});

// src/views/util.js
var require_util = __commonJS({
  "src/views/util.js"(exports, module) {
    "use strict";
    var ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    function esc(value) {
      return String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);
    }
    function timeAgo(sqliteUtc) {
      if (!sqliteUtc) return "never";
      const then = (/* @__PURE__ */ new Date(`${String(sqliteUtc).replace(" ", "T")}Z`)).getTime();
      if (Number.isNaN(then)) return String(sqliteUtc);
      const s = Math.max(0, Math.floor((Date.now() - then) / 1e3));
      if (s < 60) return "just now";
      const m = Math.floor(s / 60);
      if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h ago`;
      const d = Math.floor(h / 24);
      if (d < 30) return `${d}d ago`;
      const mo = Math.floor(d / 30);
      if (mo < 12) return `${mo}mo ago`;
      return `${Math.floor(mo / 12)}y ago`;
    }
    function pageWindow(page, pages) {
      if (pages <= 9) return Array.from({ length: pages }, (_, i) => i + 1);
      const keep = [.../* @__PURE__ */ new Set([1, 2, page - 1, page, page + 1, pages - 1, pages])].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
      const out = [];
      let prev = 0;
      for (const p of keep) {
        if (p - prev > 1) out.push("\u2026");
        out.push(p);
        prev = p;
      }
      return out;
    }
    function pagination(page, pages, hrefFor, label = "Pages") {
      if (pages <= 1) return "";
      const items = pageWindow(page, pages).map((p) => {
        if (p === "\u2026") return '<span class="page gap" aria-hidden="true">\u2026</span>';
        if (p === page) return `<span class="page current" aria-current="page">${p}</span>`;
        return `<a class="page" href="${esc(hrefFor(p))}">${p}</a>`;
      }).join("\n");
      return `<nav class="pagination" aria-label="${esc(label)}">${items}</nav>`;
    }
    var map = (items, fn) => items.map(fn).join("");
    module.exports = { esc, timeAgo, pageWindow, pagination, map };
  }
});

// src/views/layout.js
var require_layout = __commonJS({
  "src/views/layout.js"(exports, module) {
    "use strict";
    var { esc } = require_util();
    var BRAND_MARK = `<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
  <path d="M16 4L26.4 22H5.6z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>
  <path d="M16 28L5.6 10h20.8z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>
</svg>`;
    var FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23ffffff'/%3E%3Cpath d='M16 5L25.5 21.5H6.5z' fill='none' stroke='%230137B7' stroke-width='2.6' stroke-linejoin='round'/%3E%3Cpath d='M16 27L6.5 10.5h19z' fill='none' stroke='%230137B7' stroke-width='2.6' stroke-linejoin='round'/%3E%3C/svg%3E";
    function termsGate(ctx) {
      return `<div class="terms-gate" role="dialog" aria-modal="true" aria-labelledby="terms-gate-title">
  <div class="terms-gate-card">
    <h2 id="terms-gate-title">Before you continue</h2>
    <p>To use ${esc(ctx.appName)} you need to accept our
      <a href="/terms">Terms &amp; Conditions</a> and <a href="/privacy">Privacy Policy</a>.</p>
    <ul class="terms-gate-points">
      <li>You may not tamper with, clone, copy, decompile or redistribute our software.</li>
      <li>Disputes are resolved by <strong>binding private arbitration</strong>, individually \u2014 not in court and not as a class action.</li>
      <li>We log the IP address and browser of sign-ups, logins and downloads for security.</li>
    </ul>
    <form method="post" action="/legal/accept" class="terms-gate-actions">
      <input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">
      <input type="hidden" name="next" value="${esc(ctx.path)}">
      <button type="submit" class="btn btn-primary" autofocus>I accept</button>
      <a class="btn btn-outline" href="/terms">Read the Terms</a>
    </form>
    <p class="terms-gate-note">Accepting records the date, your IP address and the version you agreed to
      (<span class="mono">${esc(ctx.termsVersion)}</span>). If you do not accept, please close this page.</p>
  </div>
</div>`;
    }
    function nav(ctx) {
      const link = (href, label, active) => `<a href="${href}" class="${active ? "active" : ""}">${label}</a>`;
      const authArea = ctx.user ? `<span class="nav-user"><span class="avatar" aria-hidden="true">${esc(ctx.user.username[0].toUpperCase())}</span>${esc(ctx.user.username)}</span>
       <form method="post" action="/auth/logout" class="inline-form">
         <input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">
         <button type="submit" class="btn btn-ghost btn-sm">Log out</button>
       </form>` : `<a href="/auth/login" class="btn btn-ghost btn-sm">Log in</a>
       <a href="/auth/signup" class="btn btn-primary btn-sm">Sign up</a>`;
      return `<header class="site-nav" id="site-nav">
  <div class="container nav-inner">
    <a class="brand" href="/" aria-label="${esc(ctx.appName)} home">${BRAND_MARK}<span>Goy<em>Hub</em></span></a>
    <nav class="nav-links" aria-label="Main">
      ${link("/", "Home", ctx.path === "/")}
      ${link("/forum", "Forum", ctx.path.startsWith("/forum"))}
      ${link("/download", "Download", ctx.path.startsWith("/download"))}
      ${ctx.user && ctx.user.role === "admin" ? link("/admin", "Admin", ctx.path.startsWith("/admin")) : ""}
    </nav>
    <div class="nav-auth">${authArea}</div>
  </div>
</header>`;
    }
    function footer(ctx) {
      const c = ctx.company;
      const accountLinks = ctx.user ? '<a href="/forum/new">New thread</a>' : '<a href="/auth/signup">Sign up</a><a href="/auth/login">Log in</a>';
      const operator = c.isPlaceholder ? c.tradingName : c.legalName;
      return `<footer class="site-footer">
  <div class="container footer-grid">
    <div>
      <a class="brand brand-footer" href="/">${BRAND_MARK}<span>Goy<em>Hub</em></span></a>
      <p class="footer-blurb">The all-in-one CS2 companion. Track your stats, manage your configs, and play at your peak.</p>
    </div>
    <nav aria-label="Product"><h3>Product</h3>
      <a href="/download">Download</a><a href="/#features">Features</a><a href="/#stats">Stats</a></nav>
    <nav aria-label="Community"><h3>Community</h3>
      <a href="/forum">Forum</a><a href="/forum/c/support">Support</a><a href="/forum/c/configs">Configs &amp; Setups</a></nav>
    <nav aria-label="Account"><h3>Account</h3>${accountLinks}</nav>
    <nav aria-label="Legal"><h3>Legal</h3>
      <a href="/terms">Terms &amp; Conditions</a><a href="/privacy">Privacy Policy</a></nav>
  </div>
  <div class="container footer-bottom">
    <span>\xA9 2026 ${esc(c.tradingName)} \xB7 v${esc(ctx.appVersion)}</span>
    <span class="footer-legal-line">
      Operated by ${esc(operator)}, registered in the ${esc(c.jurisdiction)}.
      Fan-made companion app. Not affiliated with Valve Corporation. Counter-Strike and CS2 are trademarks of Valve.
    </span>
  </div>
</footer>`;
    }
    function page(ctx, { title, body, bodyClass = "", scripts = [] } = {}) {
      const fullTitle = title ? `${title} \xB7 ${ctx.appName}` : `${ctx.appName} \u2014 The Ultimate CS2 Companion`;
      const flash = ctx.flash ? `<div class="flash flash-${ctx.flash.type === "error" ? "error" : "success"}" role="status"><div class="container">${esc(ctx.flash.message)}</div></div>` : "";
      const extraScripts = scripts.map((src) => `<script src="${esc(src)}" defer><\/script>`).join("\n");
      return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="GoyHub is the all-in-one CS2 companion app: match stats, crosshair &amp; config manager, skin tracker and performance presets. Free download.">
<link rel="icon" href="${FAVICON}">
<meta name="theme-color" content="#0137B7">
<link rel="stylesheet" href="/css/style.css">
<script src="/js/boot.js"><\/script>
</head>
<body class="${esc(bodyClass)}">
<a class="skip-link" href="#main">Skip to content</a>
${nav(ctx)}
${flash}
${ctx.needsTermsGate ? termsGate(ctx) : ""}
<main id="main">
${body}
</main>
${footer(ctx)}
<script src="/js/main.js" defer><\/script>
${extraScripts}
</body>
</html>`;
    }
    module.exports = { page, BRAND_MARK };
  }
});

// src/views/site.js
var require_site = __commonJS({
  "src/views/site.js"(exports, module) {
    "use strict";
    var { page } = require_layout();
    var { esc, timeAgo, map } = require_util();
    var DOWNLOAD_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0l-5-5m5 5l5-5M4 19h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var FEATURES = [
      [
        '<path d="M4 20V10m6 10V4m6 16v-7m4 7H2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
        "Match stats &amp; heatmaps",
        "Automatic post-match breakdowns: K/D, ADR, utility damage and position heatmaps for every map you queue."
      ],
      [
        '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5" stroke="currentColor" stroke-width="2"/>',
        "Crosshair &amp; config manager",
        "Save, preview and share crosshair codes and autoexecs. One click to apply a pro's full setup."
      ],
      [
        '<path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
        "FPS boost presets",
        "Curated video settings and launch options per GPU tier. Squeeze every frame out of your rig, safely."
      ],
      [
        '<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 15h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
        "Skin inventory tracker",
        "Track your inventory value over time with price history charts and float details for every item."
      ],
      [
        '<path d="M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm12 10v-2a4 4 0 00-3-3.87M15 3.13a4 4 0 010 7.75" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
        "Community configs",
        "Browse setups shared on the forum, upvote what works and publish your own with one click."
      ],
      [
        '<path d="M12 3l7 4v5c0 4.4-3 8.5-7 9-4-.5-7-4.6-7-9V7l7-4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
        "Clean &amp; VAC-safe",
        "GoyHub never touches game memory. No injectors, no overlays in ranked, no risk to your account."
      ]
    ];
    function home(ctx, { stats, recentThreads, downloadMeta }) {
      const heroCta = ctx.user ? `<a class="btn btn-primary btn-lg btn-download" href="/download/file" rel="nofollow">${DOWNLOAD_ICON}Download for Windows</a>` : '<a class="btn btn-primary btn-lg" href="/auth/signup">Create a free account</a>';
      const heroMeta = ctx.user ? `Free \xB7 v${esc(ctx.appVersion)} \xB7 ${esc(downloadMeta.sizeKb)} KB \xB7 <span class="mono">SHA-256 ${esc(downloadMeta.sha256.slice(0, 12))}\u2026</span>` : `Free \xB7 v${esc(ctx.appVersion)} \xB7 Windows 10/11 \xB7 <a href="/auth/login?next=%2Fdownload">Already a member? Log in to download</a>`;
      const bottomCta = ctx.user ? `<p class="reveal"><a class="btn btn-primary btn-lg btn-download" href="/download/file" rel="nofollow">${DOWNLOAD_ICON}Download GoyHub v${esc(ctx.appVersion)}</a></p>
       <p class="fineprint mono reveal">SHA-256: ${esc(downloadMeta.sha256)}</p>` : `<p class="reveal"><a class="btn btn-primary btn-lg" href="/auth/signup">Sign up to download</a></p>
       <p class="fineprint reveal">Downloads are for members only. Already have an account? <a href="/auth/login?next=%2Fdownload">Log in</a>.</p>`;
      const recent = recentThreads.length === 0 ? '<p class="muted reveal">No threads yet \u2014 <a href="/forum">be the first to post</a>.</p>' : map(recentThreads, (t) => `<a class="recent-thread reveal" href="/forum/t/${esc(t.id)}">
        <span class="recent-cat">${esc(t.category)}</span>
        <span class="recent-title">${esc(t.title)}</span>
        <span class="recent-meta">by ${esc(t.username)} \xB7 ${esc(timeAgo(t.updated_at))}</span></a>`);
      const body = `
<section class="hero" id="hero">
  <canvas id="hero-canvas" aria-hidden="true"></canvas>
  <div class="hero-grid-overlay" aria-hidden="true"></div>
  <div class="container hero-inner">
    <p class="hero-kicker reveal">// THE CS2 COMPANION APP</p>
    <h1 class="hero-title reveal">Play smarter.<br><span class="gradient-text">Aim harder.</span></h1>
    <p class="hero-sub reveal">GoyHub puts your match stats, crosshair codes, config manager and performance presets
      in one lightweight app \u2014 so you can stop tabbing out and start ranking up.</p>
    <div class="hero-cta reveal">
      ${heroCta}
      <a class="btn btn-outline btn-lg" href="/forum">Join the community</a>
    </div>
    <p class="hero-meta reveal">${heroMeta}</p>
  </div>
  <div class="hero-cards" aria-hidden="true">
    <div class="hud-card hud-card-1"><span class="hud-label">HEADSHOT %</span><span class="hud-value">61.4</span><span class="hud-trend up">\u25B2 4.2 this week</span></div>
    <div class="hud-card hud-card-2"><span class="hud-label">AVG FPS</span><span class="hud-value">387</span><span class="hud-trend up">\u25B2 optimized</span></div>
    <div class="hud-card hud-card-3"><span class="hud-label">RATING</span><span class="hud-value">1.27</span><span class="hud-trend">last 20 matches</span></div>
  </div>
  <div class="hero-fade" aria-hidden="true"></div>
</section>

<section class="section stats-strip" id="stats">
  <div class="container stats-grid">
    <div class="stat reveal"><span class="stat-value" data-count="${esc(stats.users)}">${esc(stats.users)}</span><span class="stat-label">Registered players</span></div>
    <div class="stat reveal"><span class="stat-value" data-count="${esc(stats.downloads)}">${esc(stats.downloads)}</span><span class="stat-label">Downloads served</span></div>
    <div class="stat reveal"><span class="stat-value" data-count="${esc(stats.threads)}">${esc(stats.threads)}</span><span class="stat-label">Forum threads</span></div>
    <div class="stat reveal"><span class="stat-value" data-count="${esc(stats.posts)}">${esc(stats.posts)}</span><span class="stat-label">Posts &amp; replies</span></div>
  </div>
</section>

<section class="section" id="features">
  <div class="container">
    <p class="section-kicker reveal">// FEATURES</p>
    <h2 class="section-title reveal">Everything you alt-tab for.<br>Now in one place.</h2>
    <div class="features-grid">
      ${map(FEATURES, ([icon, title, copy]) => `<article class="feature-card reveal">
        <div class="feature-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${icon}</svg></div>
        <h3>${title}</h3><p>${copy}</p></article>`)}
    </div>
  </div>
</section>

<section class="section community-section">
  <div class="container">
    <p class="section-kicker reveal">// COMMUNITY</p>
    <h2 class="section-title reveal">Fresh from the forum</h2>
    <div class="recent-threads">${recent}</div>
    <p class="center reveal"><a class="btn btn-outline" href="/forum">Browse the forum</a></p>
  </div>
</section>

<section class="section download-cta" id="download">
  <div class="container center">
    <h2 class="section-title reveal">Ready to rank up?</h2>
    <p class="muted reveal">Windows 10/11 \xB7 64-bit \xB7 ${esc(downloadMeta.sizeKb)} KB installer</p>
    ${bottomCta}
  </div>
</section>`;
      return page(ctx, { title: null, body, bodyClass: "landing" });
    }
    function downloadPage(ctx, { downloadMeta }) {
      const action = ctx.user ? `<a class="btn btn-primary btn-lg btn-download" href="/download/file" rel="nofollow">${DOWNLOAD_ICON}Download now</a>` : `<span class="download-gate">
         <a class="btn btn-primary btn-lg" href="/auth/signup">Sign up to download</a>
         <a class="btn btn-outline btn-lg" href="/auth/login?next=%2Fdownload">Log in</a>
       </span>`;
      const body = `
<div class="section download-page">
  <div class="container narrow">
    <p class="section-kicker">// DOWNLOAD</p>
    <h1 class="section-title">Get GoyHub v${esc(ctx.appVersion)}</h1>
    <p class="muted">The installer is small, fast and clean. No bundled junk, no background miners, no nonsense.</p>
    <div class="download-box">
      <div>
        <strong>GoyHub-Setup-1.0.0.zip</strong>
        <span class="muted"> \xB7 Windows 10/11 (64-bit) \xB7 ${esc(downloadMeta.sizeKb)} KB</span>
        ${ctx.user ? "" : `<div class="muted">Downloads are available to members. It's free to join.</div>`}
      </div>
      ${action}
    </div>
    <h2>Verify your download</h2>
    <p class="muted">Always check the checksum before installing \u2014 if it does not match, delete the file.</p>
    <pre class="mono code-block">SHA-256  ${esc(downloadMeta.sha256)}</pre>
    <h2>Install in 3 steps</h2>
    <ol class="steps">
      <li>Unzip the archive and run <span class="mono">GoyHubSetup.exe</span>.</li>
      <li>Sign in with your GoyHub account (or <a href="/auth/signup">create one free</a>).</li>
      <li>Launch CS2 \u2014 GoyHub picks up your matches automatically.</li>
    </ol>
    <h2>System requirements</h2>
    <ul class="muted"><li>Windows 10 or 11, 64-bit</li><li>2 GB RAM \xB7 200 MB disk space</li><li>Counter-Strike 2 installed via Steam</li></ul>
    <p class="fineprint">Downloads are logged (IP address, browser and timestamp) for security and abuse prevention \u2014
      see our <a href="/privacy">Privacy Policy</a>. Installing GoyHub is subject to our
      <a href="/terms">Terms &amp; Conditions</a>. Trouble installing? Ask in the
      <a href="/forum/c/support">Support forum</a>.</p>
  </div>
</div>`;
      return page(ctx, { title: "Download", body });
    }
    function errorPage(ctx, { code, title, message }) {
      const body = `
<section class="section error-page">
  <div class="container narrow center">
    <div class="error-code" aria-hidden="true">${esc(code)}</div>
    <h1>${esc(title)}</h1>
    <p class="muted">${esc(message)}</p>
    <p><a class="btn btn-primary" href="/">Back to home</a></p>
  </div>
</section>`;
      return page(ctx, { title, body });
    }
    module.exports = { home, downloadPage, errorPage, DOWNLOAD_ICON };
  }
});

// src/middleware.js
var require_middleware = __commonJS({
  "src/middleware.js"(exports, module) {
    "use strict";
    var { getCookie, setCookie, deleteCookie } = require_cookie2();
    var { newToken, sha256hex, safeEqual } = require_crypto2();
    var { errorPage } = require_site();
    var SESSION_COOKIE = "ghsession";
    var CSRF_COOKIE = "ghcsrf";
    var FLASH_COOKIE = "ghflash";
    var TERMS_COOKIE = "ghterms";
    var SESSION_DAYS = 7;
    var TERMS_VERSION = "2026-08-21";
    var TERMS_GATE_EXEMPT = /* @__PURE__ */ new Set(["/terms", "/privacy", "/legal/accept"]);
    function isSecure(c) {
      if (c.req.header("x-forwarded-proto") === "https") return true;
      try {
        return new URL(c.req.url).protocol === "https:";
      } catch {
        return false;
      }
    }
    function cookieOptions(c, extra = {}) {
      return { httpOnly: true, sameSite: "Lax", secure: isSecure(c), path: "/", ...extra };
    }
    function clientIp(c) {
      const cf = c.req.header("cf-connecting-ip");
      if (cf) return cf;
      const cfg = c.get("cfg") || {};
      if (cfg.TRUST_PROXY) {
        const xff = c.req.header("x-forwarded-for");
        if (xff) return xff.split(",")[0].trim();
      }
      const socket = c.env && c.env.incoming && c.env.incoming.socket;
      return socket && socket.remoteAddress || "unknown";
    }
    function userAgent(c) {
      return String(c.req.header("user-agent") || "").slice(0, 300);
    }
    var securityHeaders = async (c, next) => {
      await next();
      c.header(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
      );
      c.header("X-Content-Type-Options", "nosniff");
      c.header("X-Frame-Options", "DENY");
      c.header("Referrer-Policy", "no-referrer");
      c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
      c.header("Cross-Origin-Opener-Policy", "same-origin");
    };
    async function audit(c, event, { userId = null, username = null, detail = null } = {}) {
      const db = c.get("db");
      await db.run(
        "INSERT INTO ip_logs (user_id, username, event, ip, user_agent, detail) VALUES (?, ?, ?, ?, ?, ?)",
        userId,
        username,
        event,
        clientIp(c) || "unknown",
        userAgent(c),
        detail
      );
    }
    async function createSession(c, userId) {
      const db = c.get("db");
      const token = newToken(32);
      const csrf = newToken(16);
      const expiresUnix = Math.floor((Date.now() + SESSION_DAYS * 864e5) / 1e3);
      await db.run(
        `INSERT INTO sessions (token_hash, user_id, csrf_hash, ip, user_agent, expires_at)
     VALUES (?, ?, ?, ?, ?, datetime(?, 'unixepoch'))`,
        await sha256hex(token),
        userId,
        await sha256hex(csrf),
        clientIp(c),
        userAgent(c),
        expiresUnix
      );
      setCookie(c, SESSION_COOKIE, token, cookieOptions(c, { maxAge: SESSION_DAYS * 86400 }));
      setCookie(c, CSRF_COOKIE, csrf, cookieOptions(c));
      const view = c.get("view");
      view.csrfToken = csrf;
      return token;
    }
    async function destroySession(c) {
      const token = getCookie(c, SESSION_COOKIE);
      if (token) {
        await c.get("db").run("DELETE FROM sessions WHERE token_hash = ?", await sha256hex(token));
      }
      deleteCookie(c, SESSION_COOKIE, cookieOptions(c));
    }
    async function destroyUserSessions(db, userId) {
      await db.run("DELETE FROM sessions WHERE user_id = ?", userId);
    }
    var loadContext = async (c, next) => {
      const db = c.get("db");
      const url = new URL(c.req.url);
      const view = {
        user: null,
        path: url.pathname,
        flash: null,
        csrfToken: "",
        needsTermsGate: false,
        termsVersion: TERMS_VERSION,
        company: c.get("company"),
        appName: "GoyHub",
        appVersion: c.get("appVersion")
      };
      c.set("view", view);
      const rawFlash = getCookie(c, FLASH_COOKIE);
      if (rawFlash) {
        try {
          const parsed = JSON.parse(atob(rawFlash.replace(/-/g, "+").replace(/_/g, "/")));
          if (parsed && typeof parsed.message === "string") {
            view.flash = {
              type: parsed.type === "error" ? "error" : "success",
              message: parsed.message.slice(0, 500)
            };
          }
        } catch {
        }
        deleteCookie(c, FLASH_COOKIE, cookieOptions(c));
      }
      const token = getCookie(c, SESSION_COOKIE);
      if (token) {
        const row = /^[a-f0-9]{64}$/.test(token) ? await db.get(
          `SELECT u.id, u.username, u.email, u.role, u.banned, u.created_at,
                s.id AS session_id, s.csrf_hash
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > datetime('now')`,
          await sha256hex(token)
        ) : null;
        if (row && !row.banned) {
          c.set("user", row);
          view.user = row;
          c.set("sessionId", row.session_id);
          c.set("sessionCsrfHash", row.csrf_hash);
        } else {
          if (row && row.banned) await destroyUserSessions(db, row.id);
          deleteCookie(c, SESSION_COOKIE, cookieOptions(c));
        }
      }
      await next();
    };
    function setFlash(c, type, message) {
      const encoded = btoa(JSON.stringify({ type, message })).replace(/\+/g, "-").replace(/\//g, "_");
      setCookie(c, FLASH_COOKIE, encoded, cookieOptions(c, { maxAge: 60 }));
    }
    var csrfProtection = async (c, next) => {
      const db = c.get("db");
      const view = c.get("view");
      const user = c.get("user");
      const sessionCsrfHash = c.get("sessionCsrfHash");
      let csrf = getCookie(c, CSRF_COOKIE);
      const bound = user && sessionCsrfHash ? Boolean(csrf) && await sha256hex(csrf) === sessionCsrfHash : true;
      if (!csrf || !/^[a-f0-9]{32}$/.test(csrf) || !bound) {
        csrf = newToken(16);
        setCookie(c, CSRF_COOKIE, csrf, cookieOptions(c));
        if (user && c.get("sessionId")) {
          const hash = await sha256hex(csrf);
          await db.run("UPDATE sessions SET csrf_hash = ? WHERE id = ?", hash, c.get("sessionId"));
          c.set("sessionCsrfHash", hash);
        }
      }
      view.csrfToken = csrf;
      if (["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method)) {
        const body = await c.req.parseBody();
        c.set("body", body);
        const submitted = body._csrf;
        const currentHash = c.get("sessionCsrfHash");
        const sessionOk = user && currentHash ? await sha256hex(csrf) === currentHash : true;
        if (!submitted || !safeEqual(submitted, csrf) || !sessionOk) {
          return c.html(errorPage(view, {
            code: 403,
            title: "Request blocked",
            message: "Invalid or missing security token. Go back, refresh the page and try again."
          }), 403);
        }
      }
      await next();
    };
    var termsGate = async (c, next) => {
      const view = c.get("view");
      view.needsTermsGate = c.req.method === "GET" && !TERMS_GATE_EXEMPT.has(view.path) && getCookie(c, TERMS_COOKIE) !== TERMS_VERSION;
      await next();
    };
    function acceptTerms(c) {
      setCookie(c, TERMS_COOKIE, TERMS_VERSION, cookieOptions(c, {
        maxAge: 365 * 86400,
        httpOnly: false
        // readable by the page so the dialog can stay dismissed
      }));
    }
    async function formBody(c) {
      const cached = c.get("body");
      if (cached) return cached;
      const body = await c.req.parseBody();
      c.set("body", body);
      return body;
    }
    function requireAuth(c) {
      if (c.get("user")) return null;
      setFlash(c, "error", "You need to sign in to do that.");
      const next = encodeURIComponent(new URL(c.req.url).pathname + new URL(c.req.url).search);
      return c.redirect(`/auth/login?next=${next}`, 302);
    }
    function requireAdmin(c) {
      const user = c.get("user");
      if (user && user.role === "admin") return null;
      return c.html(errorPage(c.get("view"), {
        code: 404,
        title: "Not found",
        message: "This page does not exist."
      }), 404);
    }
    module.exports = {
      SESSION_COOKIE,
      CSRF_COOKIE,
      FLASH_COOKIE,
      TERMS_COOKIE,
      TERMS_VERSION,
      securityHeaders,
      loadContext,
      csrfProtection,
      termsGate,
      createSession,
      destroySession,
      destroyUserSessions,
      acceptTerms,
      setFlash,
      formBody,
      requireAuth,
      requireAdmin,
      clientIp,
      userAgent,
      audit,
      cookieOptions
    };
  }
});

// src/config/company.js
var require_company = __commonJS({
  "src/config/company.js"(exports, module) {
    "use strict";
    var PLACEHOLDER = /^\[.*\]$/;
    function createCompany(env = {}) {
      const company = {
        legalName: env.COMPANY_LEGAL_NAME || "[Registered Company Name]",
        tradingName: env.COMPANY_TRADING_NAME || "GoyHub",
        registrationNumber: env.COMPANY_REG_NUMBER || "[Registration Number]",
        addressLine: env.COMPANY_ADDRESS || "[Registered Office Address]",
        city: env.COMPANY_CITY || "Mutsamudu",
        jurisdiction: "Autonomous Island of Anjouan, Union of the Comoros",
        country: "Union of the Comoros",
        contactEmail: env.COMPANY_CONTACT_EMAIL || "support@goyhub.com",
        privacyEmail: env.COMPANY_PRIVACY_EMAIL || "privacy@goyhub.com",
        legalEmail: env.COMPANY_LEGAL_EMAIL || "legal@goyhub.com",
        lastUpdated: env.LEGAL_LAST_UPDATED || "21 August 2026",
        minimumAge: 16
      };
      company.fullAddress = `${company.addressLine}, ${company.city}, ${company.jurisdiction}`;
      company.isPlaceholder = [
        company.legalName,
        company.registrationNumber,
        company.addressLine
      ].some((value) => PLACEHOLDER.test(value));
      return company;
    }
    module.exports = { createCompany };
  }
});

// src/views/legal.js
var require_legal = __commonJS({
  "src/views/legal.js"(exports, module) {
    "use strict";
    var { page } = require_layout();
    var { esc, map } = require_util();
    function render(ctx, { title, kicker, sections, updated }) {
      const c = ctx.company;
      const toc = `<nav class="legal-toc" aria-label="Sections"><h2>On this page</h2><ol>
    ${map(sections, (s, i) => `<li><a href="#${esc(s.id)}">${i + 1}. ${esc(s.title)}</a></li>`)}
  </ol></nav>`;
      const placeholderNote = c.isPlaceholder ? `<p class="legal-placeholder-note">
    <strong>Setup required.</strong> This document still contains placeholder company details.
    Set <span class="mono">COMPANY_LEGAL_NAME</span>, <span class="mono">COMPANY_REG_NUMBER</span> and
    <span class="mono">COMPANY_ADDRESS</span> (see <span class="mono">src/config/company.js</span>),
    and have a qualified lawyer review this text before publishing.</p>` : "";
      const bodySections = map(sections, (s, i) => {
        const isLast = i === sections.length - 1;
        const heading = `<h2 id="${esc(s.id)}">${i + 1}. ${esc(s.title)}</h2>`;
        return isLast ? `<div class="legal-contact" id="${esc(s.id)}"><h2>${i + 1}. ${esc(s.title)}</h2>${s.html}</div>` : heading + s.html;
      });
      const body = `
<section class="section legal-page">
  <div class="container">
    <div class="page-head"><div>
      <p class="section-kicker">${esc(kicker)}</p>
      <h1 class="section-title">${esc(title)}</h1>
    </div></div>
    <div class="legal-layout">
      ${toc}
      <div class="legal-body">
        <p class="legal-updated">${esc(updated)}</p>
        ${placeholderNote}
        ${sections.summary || ""}
        ${bodySections}
      </div>
    </div>
  </div>
</section>`;
      return page(ctx, { title, body });
    }
    function summaryBlock(points) {
      return `<div class="legal-summary"><h2>The short version</h2>
    <p>This summary is for convenience only \u2014 the numbered sections below are what actually apply.</p>
    <ul>${points.map((p) => `<li>${p}</li>`).join("")}</ul></div>`;
    }
    function contactBlock(c, extra) {
      return `<p>${extra}</p><address>
    <strong>${esc(c.legalName)}</strong><br>
    ${esc(c.addressLine)}<br>
    ${esc(c.city)}, ${esc(c.jurisdiction)}<br>
    Registration number: ${esc(c.registrationNumber)}<br>
    ${extra.includes("privacy") || extra.includes("rights") ? `Privacy: <a href="mailto:${esc(c.privacyEmail)}">${esc(c.privacyEmail)}</a><br>General: <a href="mailto:${esc(c.contactEmail)}">${esc(c.contactEmail)}</a>` : `General: <a href="mailto:${esc(c.contactEmail)}">${esc(c.contactEmail)}</a><br>Legal &amp; arbitration opt-out: <a href="mailto:${esc(c.legalEmail)}">${esc(c.legalEmail)}</a>`}
  </address>`;
    }
    function terms(ctx) {
      const c = ctx.company;
      const mailLegal = `<a href="mailto:${esc(c.legalEmail)}">${esc(c.legalEmail)}</a>`;
      const mailContact = `<a href="mailto:${esc(c.contactEmail)}">${esc(c.contactEmail)}</a>`;
      const j = esc(c.jurisdiction);
      const sections = [
        { id: "s1", title: "Who we are", html: `
      <p>GoyHub (the <strong>"Service"</strong>) is operated by <strong>${esc(c.legalName)}</strong>
      (<strong>"we"</strong>, <strong>"us"</strong>, <strong>"our"</strong>), a company registered in the
      ${j} under registration number ${esc(c.registrationNumber)}, with its registered office at
      ${esc(c.addressLine)}, ${esc(c.city)}, ${j}.</p>
      <p>The Service consists of this website, the GoyHub community forum, the GoyHub desktop application
      for Windows, and any related software, downloads, content and support channels we make available.</p>` },
        { id: "s2", title: "Accepting these terms", html: `
      <p>These Terms &amp; Conditions (the <strong>"Terms"</strong>) form a binding agreement between you and
      us. You accept them by any of the following, whichever happens first:</p>
      <ul>
        <li>selecting <strong>"I accept"</strong> in the notice shown when you first open the Service;</li>
        <li>creating a GoyHub account;</li>
        <li>downloading, installing or using the GoyHub application; or</li>
        <li>otherwise continuing to use the Service.</li>
      </ul>
      <p>Our <a href="/privacy">Privacy Policy</a> is incorporated into these Terms by reference. We record
      the date, IP address and version accepted when you select "I accept". If you do not agree to these
      Terms, you must not use the Service.</p>` },
        { id: "s3", title: "Eligibility", html: `
      <p>You must be at least ${esc(c.minimumAge)} years old to create a GoyHub account. If the law where you
      live sets a higher minimum age for consenting to online services or to the processing of your personal
      data, you must meet that higher age instead.</p>
      <p>By creating an account you represent that you meet these requirements, that the information you give
      us is accurate, and that you are not barred from using the Service under any applicable law or under a
      previous suspension or ban issued by us.</p>` },
        { id: "s4", title: "Your account", html: `
      <p>You need an account to post on the forum, to download the application, and to sign in to it. You are
      responsible for everything that happens under your account.</p>
      <ul>
        <li>Choose a strong, unique password and keep it confidential. We store passwords only as salted PBKDF2 hashes and can never tell you your password.</li>
        <li>Do not share, sell, rent, transfer or lend your account, and do not let anyone else use it.</li>
        <li>Do not create an account on behalf of anyone else, or create a new account to evade a ban.</li>
        <li>Do not use bots, scripts or automated tooling to register accounts, or attempt to defeat our human-verification checks.</li>
        <li>Tell us promptly at ${mailContact} if you believe your account has been accessed without your permission.</li>
      </ul>
      <p>We may refuse, reclaim or rename any username that impersonates another person, implies affiliation
      with us or our staff, or that we consider offensive or misleading.</p>` },
        { id: "s5", title: "Licence to use GoyHub", html: `
      <p>The Service and the GoyHub application are <strong>licensed to you, not sold</strong>. Subject to your
      compliance with these Terms, we grant you a personal, limited, non-exclusive, non-transferable,
      non-sublicensable and revocable licence to download and use one copy of the GoyHub application on
      devices you control, and to access the Service, in each case for your own personal, non-commercial use.</p>
      <p>All rights not expressly granted to you are reserved by us. The GoyHub name, logo, site design,
      source code, compiled binaries, database schema, written content and all associated intellectual
      property remain our property or that of our licensors.</p>` },
        { id: "s6", title: "No tampering, cloning or copying", html: `
      <p>This section is a material condition of the licence granted in section 5. You must not, and must not
      permit or assist any other person to:</p>
      <h3>6.1 Copying and cloning</h3>
      <ul>
        <li>copy, reproduce, duplicate, mirror or archive the Service, the application, or any part of either, except for a single backup copy of the installer for your own personal use;</li>
        <li><strong>clone, fork, re-skin, re-brand or otherwise create a substantially similar product or service</strong> derived from the Service, its source code, its compiled binaries, its design, its interface or its underlying structure;</li>
        <li>sell, resell, rent, lease, lend, sublicense, distribute, publish, host, or otherwise make the application available to any third party;</li>
        <li>use the Service, its content or its data to build, train, benchmark or improve a competing product, service or model;</li>
        <li>scrape, crawl, harvest, index or bulk-extract any content, user data or statistics from the Service by any automated means, except for well-behaved search engine indexing that respects our robots directives.</li>
      </ul>
      <h3>6.2 Tampering and reverse engineering</h3>
      <ul>
        <li>modify, adapt, translate, patch, hook, inject into, or create derivative works of the application or the Service;</li>
        <li>reverse engineer, decompile, disassemble or otherwise attempt to derive the source code, algorithms, file formats or protocols of the application, <strong>except</strong> to the extent that this restriction is expressly prohibited by applicable law and only after you have asked us in writing for the information you need;</li>
        <li>circumvent, disable, remove or interfere with any licensing, authentication, access-control, rate-limiting, human-verification, integrity-check or security feature;</li>
        <li>remove, obscure, alter or falsify any copyright notice, trademark, watermark, version identifier or attribution;</li>
        <li>distribute a modified, repackaged, cracked, patched or otherwise altered build of the application, or present any such build as genuine GoyHub software;</li>
        <li>tamper with, forge or replay requests to our servers or APIs, or interfere with the integrity or performance of the Service;</li>
        <li>probe, scan or test the vulnerability of any of our systems, or breach or circumvent any security or authentication measure, other than under a written authorisation from us.</li>
      </ul>
      <h3>6.3 Consequences</h3>
      <p>Breach of this section terminates your licence immediately and automatically, without notice. You
      acknowledge that a breach of this section may cause us harm for which damages alone are an inadequate
      remedy, and that we may seek injunctive or other equitable relief in addition to any other remedy
      available to us. Nothing in section 17 (Binding arbitration) prevents either party from seeking urgent
      injunctive relief from a court to protect its intellectual property.</p>
      <p>If you believe you have found a security vulnerability, please report it to ${mailContact} rather
      than exploiting it.</p>` },
        { id: "s7", title: "Acceptable use", html: `
      <p>When using the forum or any other part of the Service, you must not post, upload, link to or share:</p>
      <ul>
        <li>cheating software, aimbots, wallhacks, injectors, exploits, or instructions or links for obtaining them;</li>
        <li>offers to buy, sell, trade, boost or rent game accounts, or to arrange match-fixing or gambling;</li>
        <li>harassment, threats, hate speech, or content targeting a person or group on the basis of a protected characteristic;</li>
        <li>sexual content involving minors, or any other content that is unlawful in the jurisdictions where it can be viewed;</li>
        <li>another person's private information (including real names, addresses, phone numbers or IP addresses) without their consent;</li>
        <li>malware, phishing links, spam, chain messages, or repetitive promotional content;</li>
        <li>content that infringes anyone's copyright, trademark, privacy or other rights.</li>
      </ul>
      <p>You must also comply with all laws that apply to you, and with the terms of any third-party service
      you use alongside GoyHub, including Steam and Counter-Strike 2.</p>` },
        { id: "s8", title: "Your content", html: `
      <p>You keep ownership of the threads, posts, configurations and other material you submit to the Service
      (<strong>"Your Content"</strong>). We do not claim ownership of it.</p>
      <p>By submitting Your Content, you grant us a worldwide, non-exclusive, royalty-free, transferable and
      sublicensable licence to host, store, reproduce, adapt for formatting purposes, publish, display and
      distribute Your Content for the purposes of operating, promoting and improving the Service. This licence
      lasts as long as Your Content remains on the Service and, for content that others have quoted, replied to
      or archived, for as long as reasonably necessary afterwards.</p>
      <p>You represent that you have all rights necessary to grant this licence, and that Your Content does not
      breach section 7 or any third party's rights. Forum content is <strong>public</strong>: anything you post
      can be read by anyone with an internet connection and may be indexed by search engines. Do not post
      anything you would not want to be public and permanent.</p>` },
        { id: "s9", title: "Moderation & enforcement", html: `
      <p>We may, but are not obliged to, monitor the Service. Where we consider it appropriate \u2014 including
      where content or conduct breaches these Terms, exposes us or other users to risk, or is the subject of a
      credible complaint \u2014 we may at our sole discretion and without prior notice:</p>
      <ul>
        <li>edit, hide, lock, move or delete any thread, post or other content;</li>
        <li>issue a warning, restrict posting, suspend or permanently ban an account;</li>
        <li>revoke access to the application and to any download;</li>
        <li>retain records of the conduct and the associated technical data described in our <a href="/privacy">Privacy Policy</a>;</li>
        <li>report conduct to law enforcement or other authorities where we believe it may be unlawful.</li>
      </ul>
      <p>Bans are enforced at the account level and may also be enforced against related accounts. We are not
      required to give reasons, and no refund or compensation is payable in connection with any moderation
      action.</p>` },
        { id: "s10", title: "Relationship with Valve", html: `
      <p>GoyHub is an independent, fan-made companion product. We are <strong>not affiliated with, endorsed by,
      sponsored by or associated with Valve Corporation</strong>. "Counter-Strike", "Counter-Strike 2", "CS2"
      and "Steam" are trademarks of Valve Corporation, used here only to describe compatibility.</p>
      <p>Your use of Counter-Strike 2 and Steam remains governed by Valve's own agreements. GoyHub does not
      read or modify game memory and does not inject code into the game. Even so, you are solely responsible
      for ensuring that your use of any third-party tool complies with Valve's rules, and we accept no
      responsibility for any action Valve takes against your game account.</p>` },
        { id: "s11", title: "Availability & changes", html: `
      <p>The Service is provided free of charge and on an "as available" basis. We do not guarantee any level
      of availability, uptime, performance or data retention. We may change, suspend, limit or discontinue the
      Service or any feature of it, in whole or in part, at any time and without liability to you.</p>
      <p>We may release updates to the application. Some updates may be required for continued use, and older
      versions may stop working without notice.</p>` },
        { id: "s12", title: "Disclaimers", html: `
      <p>To the fullest extent permitted by applicable law, the Service and everything provided through it are
      supplied <strong>"as is" and "as available", without warranties of any kind</strong>, whether express,
      implied or statutory, including any implied warranties of merchantability, fitness for a particular
      purpose, title, accuracy and non-infringement.</p>
      <p>We do not warrant that:</p>
      <ul>
        <li>the Service will be uninterrupted, timely, secure or error-free;</li>
        <li>statistics, ratings, price data, configuration recommendations or performance presets are accurate, complete or suitable for your system;</li>
        <li>content posted by other users is accurate, lawful or safe to use;</li>
        <li>any defect will be corrected, or that the Service is free of viruses or other harmful components.</li>
      </ul>
      <p>Any configuration, launch option or setting you apply is applied at your own risk. You are responsible
      for backing up your own game settings and files.</p>` },
        { id: "s13", title: "Limitation of liability", html: `
      <p>To the fullest extent permitted by applicable law, we (together with our directors, officers,
      employees, contractors and agents) will not be liable for any indirect, incidental, special,
      consequential, punitive or exemplary damages, nor for any loss of profits, revenue, goodwill, data, game
      accounts, in-game items or opportunity, however caused and under any theory of liability, even if we have
      been advised of the possibility of such damages.</p>
      <p>Our total aggregate liability arising out of or in connection with the Service or these Terms will not
      exceed the greater of (a) the total amount you have paid us in the twelve months before the event giving
      rise to the claim, or (b) USD 100.</p>
      <p>Nothing in these Terms excludes or limits liability that cannot lawfully be excluded or limited,
      including liability for fraud or fraudulent misrepresentation, or for death or personal injury caused by
      negligence. Some jurisdictions do not allow certain exclusions, so parts of this section may not apply to
      you; the remaining parts continue to apply.</p>` },
        { id: "s14", title: "Indemnity", html: `
      <p>You agree to indemnify and hold us harmless from any claim, demand, loss, liability, cost or expense
      (including reasonable legal fees) arising out of or connected with Your Content, your use of the Service,
      your breach of these Terms (including section 6), or your violation of any law or third-party right.</p>` },
        { id: "s15", title: "Suspension & termination", html: `
      <p>You may stop using the Service at any time and may ask us to close your account by contacting
      ${mailContact}.</p>
      <p>We may suspend or terminate your account and access to the Service at any time, with or without
      notice, including where we believe you have breached these Terms or where continued access poses a risk
      to us, other users or third parties.</p>
      <p>On termination, your licence under section 5 ends immediately and you must stop using and delete all
      copies of the application. Sections 6, 8 (as to content already posted), 12, 13, 14, 17, 18 and 19
      survive termination. Content you posted remains on the forum, reattributed to
      <span class="mono">[deleted]</span>; see our <a href="/privacy">Privacy Policy</a> for how we handle data
      after account closure.</p>` },
        { id: "s16", title: "Changes to these terms", html: `
      <p>We may update these Terms from time to time. When we do, we will change the "last updated" date and
      version at the top of this page, and where the changes are material we will ask you to accept the new
      version the next time you open the Service. Changes take effect when published. Your continued use of the
      Service after that point means you accept the revised Terms.</p>` },
        { id: "s17", title: "Binding arbitration & class action waiver", html: `
      <p><strong>Please read this section carefully. It affects how disputes between you and us are resolved
      and, unless you opt out under section 17.7, it requires individual arbitration instead of a court trial
      and waives your right to participate in a class action.</strong></p>
      <h3>17.1 Informal resolution first</h3>
      <p>Before starting arbitration, you agree to contact us at ${mailLegal} with a written description of the
      dispute and the relief you seek, and to negotiate in good faith for at least <strong>30 days</strong>.
      Most issues can be resolved this way.</p>
      <h3>17.2 Agreement to arbitrate</h3>
      <p>If the dispute is not resolved informally, you and we agree that any dispute, claim or controversy
      arising out of or relating to these Terms or the Service \u2014 including its formation, interpretation,
      breach, termination, validity or enforceability \u2014 will be resolved by <strong>final and binding private
      arbitration</strong>, rather than in court, except as stated in sections 17.5 and 17.7.</p>
      <h3>17.3 Rules, seat and procedure</h3>
      <ul>
        <li>The arbitration will be administered under the arbitration rules in force in the ${j}, or such other internationally recognised arbitration rules as the parties agree in writing.</li>
        <li>The <strong>seat of arbitration</strong> is the ${j}.</li>
        <li>The tribunal will consist of a <strong>single arbitrator</strong>, appointed by agreement of the parties or, failing agreement within 30 days, by the appointing authority under the applicable rules.</li>
        <li>The language of the arbitration is <strong>English</strong>.</li>
        <li>The proceedings and the award are <strong>confidential</strong>, except where disclosure is required by law or to enforce the award.</li>
        <li>Where the amount in dispute is under USD 10,000, the arbitration may be conducted on documents only, or remotely by video, unless the arbitrator directs otherwise.</li>
        <li>The arbitrator's award is final and binding, and judgment on it may be entered by any court of competent jurisdiction.</li>
      </ul>
      <h3>17.4 Individual claims only \u2014 class action waiver</h3>
      <p><strong>You and we each agree to bring claims only in an individual capacity, and not as a plaintiff or
      class member in any purported class, collective, consolidated or representative proceeding.</strong> The
      arbitrator may not consolidate the claims of more than one person and may not preside over any form of
      representative or class proceeding. If this paragraph is found unenforceable, then the whole of section 17
      is void and disputes will be resolved under section 18 instead.</p>
      <h3>17.5 Exceptions</h3>
      <p>Either party may, without breaching this section: seek urgent injunctive or other equitable relief from
      a court to protect intellectual property or confidential information, including in respect of a breach of
      section 6; bring an individual claim in a small-claims court if it qualifies under that court's rules; or
      notify a regulator or supervisory authority of a matter within its remit.</p>
      <h3>17.6 Costs</h3>
      <p>Each party bears its own legal costs. The arbitrator's fees and administrative costs are shared equally
      unless the arbitrator allocates them otherwise, including where a claim or defence is found to be
      frivolous or brought in bad faith.</p>
      <h3>17.7 Your right to opt out</h3>
      <p><strong>You may opt out of this arbitration agreement.</strong> To do so, send written notice to
      ${mailLegal} within <strong>30 days</strong> of first accepting these Terms, stating your username, the
      email address on your account, and a clear statement that you are opting out of arbitration. Opting out
      does not affect any other part of these Terms, and we will not close or penalise your account for opting
      out. If you opt out, disputes are resolved under section 18.</p>
      <h3>17.8 Consumers and mandatory law</h3>
      <p>Nothing in this section removes a right you have under mandatory consumer-protection law that cannot be
      waived by agreement. If you are a consumer resident in a jurisdiction \u2014 such as a member state of the
      European Union or the United Kingdom \u2014 where a pre-dispute agreement to arbitrate is not binding on
      consumers, this section does not apply to you to that extent, and section 18 governs instead.</p>` },
        { id: "s18", title: "Governing law & jurisdiction", html: `
      <p>These Terms and any dispute or claim arising out of or in connection with them (including
      non-contractual disputes) are governed by the laws of the ${j}, without regard to conflict-of-law rules.</p>
      <p>Where a dispute is not subject to arbitration under section 17, the courts of the ${j} have exclusive
      jurisdiction to settle it, and you submit to that jurisdiction. If you are a consumer resident elsewhere,
      this does not deprive you of the protection of any mandatory provisions of the law of your country of
      residence.</p>` },
        { id: "s19", title: "General", html: `
      <ul>
        <li><strong>Entire agreement.</strong> These Terms and the Privacy Policy are the entire agreement between you and us regarding the Service.</li>
        <li><strong>Severability.</strong> If any provision is held unenforceable, the rest remains in force and the unenforceable provision is replaced by an enforceable one reflecting the original intent as closely as possible. Section 17.4 is subject to its own rule.</li>
        <li><strong>No waiver.</strong> If we do not enforce a provision, that is not a waiver of our right to do so later.</li>
        <li><strong>Assignment.</strong> You may not assign or transfer these Terms. We may assign them to an affiliate or in connection with a merger, acquisition or sale of assets.</li>
        <li><strong>No third-party rights.</strong> No one other than you and us has any right to enforce these Terms.</li>
        <li><strong>Force majeure.</strong> Neither party is liable for a failure to perform caused by events beyond its reasonable control.</li>
        <li><strong>Language.</strong> These Terms are written in English. Any translation is provided for convenience, and the English version prevails.</li>
      </ul>` },
        { id: "s20", title: "Contact", html: contactBlock(c, "Questions about these Terms, or opting out of arbitration under section 17.7? Get in touch:") }
      ];
      sections.summary = summaryBlock([
        "GoyHub is a free companion app and community forum for Counter-Strike 2 players.",
        "You need an account to post and to download. Keep your password safe and don't share the account.",
        "<strong>You may not tamper with, clone, copy, decompile or redistribute our software.</strong>",
        "Don't cheat, harass people, or upload anything illegal. We can remove content and ban accounts.",
        "You keep ownership of what you post, but you let us host and display it on the site.",
        "<strong>Disputes go to binding private arbitration, individually \u2014 not to court and not as a class action.</strong> You can opt out within 30 days (section 17.7).",
        'The service is provided "as is", with no guarantee of uptime or fitness for any purpose.',
        "We are not affiliated with Valve Corporation."
      ]);
      return render(ctx, {
        title: "Terms & Conditions",
        kicker: "// LEGAL",
        sections,
        updated: `Last updated: ${c.lastUpdated} \xB7 Version ${ctx.termsVersion}`
      });
    }
    function privacy(ctx) {
      const c = ctx.company;
      const mailPrivacy = `<a href="mailto:${esc(c.privacyEmail)}">${esc(c.privacyEmail)}</a>`;
      const j = esc(c.jurisdiction);
      const sections = [
        { id: "p1", title: "Who we are", html: `
      <p>GoyHub is operated by <strong>${esc(c.legalName)}</strong> (<strong>"we"</strong>, <strong>"us"</strong>,
      <strong>"our"</strong>), registered in the ${j} under registration number ${esc(c.registrationNumber)},
      with its registered office at ${esc(c.addressLine)}, ${esc(c.city)}, ${j}. We are the controller of the
      personal data described in this policy.</p>` },
        { id: "p2", title: "Scope", html: `
      <p>This Privacy Policy explains what personal data we collect through the GoyHub website, community forum
      and desktop application (together, the <strong>"Service"</strong>), why we collect it, who we share it
      with, and what choices you have. It forms part of our <a href="/terms">Terms &amp; Conditions</a>.</p>
      <p>By using the Service you acknowledge the practices described here.</p>` },
        { id: "p3", title: "What we collect", html: `
      <h3>3.1 Account data</h3>
      <p>When you create an account we collect and store:</p>
      <ul>
        <li><strong>Username</strong> \u2014 public, shown alongside everything you post.</li>
        <li><strong>Email address</strong> \u2014 not shown publicly. We hold it to identify your account, to verify requests you make about it, and so we can contact you about security or service matters. We do not currently offer an automated password reset: if you lose your password, contact us.</li>
        <li><strong>Password</strong> \u2014 stored only as a salted <span class="mono">PBKDF2-HMAC-SHA256</span> hash. We never store, log or transmit your password in plain text and cannot recover it for you.</li>
        <li><strong>Account status</strong> \u2014 your role (member or administrator), whether the account is banned, and when it was created.</li>
      </ul>
      <h3>3.2 Technical and security data</h3>
      <p>We automatically record the following each time certain events occur:</p>
      <ul>
        <li><strong>IP address</strong> of the connecting device.</li>
        <li><strong>Browser user-agent string</strong> (browser and operating system identifiers).</li>
        <li><strong>Event type and timestamp</strong> \u2014 specifically for account sign-up, successful login, failed login, blocked login attempt on a banned account, logout, file download, and administrator actions.</li>
        <li><strong>Session records</strong> \u2014 a hashed session identifier, the IP address and user agent the session was created from, and its creation and expiry times.</li>
        <li><strong>Sign-up IP and most recent login IP</strong>, stored on your account record.</li>
        <li><strong>The username or email address entered in a failed sign-in attempt</strong> \u2014 recorded alongside the IP address and browser even where no such account exists, so that repeated attempts against real accounts can be investigated.</li>
        <li><strong>Failed human-verification attempts</strong> on the sign-up form, with the reason.</li>
        <li><strong>Acceptance of these terms</strong> \u2014 the date, IP address and version you accepted.</li>
      </ul>
      <h3>3.3 Content data</h3>
      <p>The threads, replies, configurations, crosshair codes and other material you submit, together with
      associated metadata such as timestamps, view counts and the category you posted in.</p>
      <h3>3.4 Application data</h3>
      <p>Where you sign in to the GoyHub desktop application, we may collect the technical data above together
      with information the application needs to function \u2014 such as your linked game profile identifier, match
      statistics it retrieves on your behalf, saved configuration profiles, application version, and diagnostic
      and crash information.</p>
      <h3>3.5 Correspondence</h3>
      <p>If you contact us by email or through a support channel, we keep the message, your contact details and
      our reply.</p>` },
        { id: "p4", title: "Cookies", html: `
      <p>The Service sets a small number of strictly necessary first-party cookies. It does not set advertising cookies.</p>
      <ul>
        <li><span class="mono">ghsession</span> \u2014 keeps you signed in. <span class="mono">HttpOnly</span>, <span class="mono">SameSite=Lax</span>, expires after 7 days, and marked <span class="mono">Secure</span> over HTTPS.</li>
        <li><span class="mono">ghcsrf</span> \u2014 a cross-site request forgery token that protects forms from being submitted by third-party sites.</li>
        <li><span class="mono">ghflash</span> \u2014 a short-lived cookie (about 60 seconds) that carries a one-off status message between pages.</li>
        <li><span class="mono">ghterms</span> \u2014 records that you accepted the Terms, and which version, so the notice is not shown again.</li>
      </ul>
      <p>These cookies are required for the Service to work; blocking them will prevent you from signing in or
      submitting forms. You can delete cookies through your browser settings at any time.</p>` },
        { id: "p5", title: "How we use your data", html: `
      <p>We use the data described above to:</p>
      <ul>
        <li>create and maintain your account and keep you signed in;</li>
        <li>operate, display and deliver the forum, the website and the application;</li>
        <li><strong>protect the Service and its users</strong> \u2014 detecting and investigating abuse, spam, bot activity, credential-stuffing and brute-force attempts, ban evasion, and multiple-account abuse; enforcing rate limits; and maintaining an audit trail of security-relevant events;</li>
        <li>moderate content and enforce our <a href="/terms">Terms &amp; Conditions</a>;</li>
        <li>respond to your support requests and send you service-related messages;</li>
        <li>understand how the Service is used, produce aggregate statistics, and develop and improve our features;</li>
        <li>comply with legal obligations and respond to lawful requests;</li>
        <li>establish, exercise or defend legal claims.</li>
      </ul>
      <p>Where the law requires a legal basis for this processing, we rely on the performance of our contract
      with you (operating your account), our legitimate interests (security, abuse prevention, moderation and
      improving the Service), your consent where we ask for it, and compliance with legal obligations.</p>` },
        { id: "p6", title: "IP address logging", html: `
      <p>Because GoyHub is a free service with an open sign-up, IP logging is central to how we keep it usable.
      We record the IP address and browser of each sign-up, login attempt, logout and download, and we retain
      those records so that our administrators can:</p>
      <ul>
        <li>identify and block accounts used for spam, harassment or cheating-related activity;</li>
        <li>detect when a banned user returns under a new account;</li>
        <li>investigate suspicious login patterns and protect accounts from takeover;</li>
        <li>evidence abuse when reporting it to a hosting provider, network operator or authority.</li>
      </ul>
      <p>These logs are visible to our administrators through an access-controlled admin interface, and every
      administrator action against an account is itself logged. Where the Service runs behind a reverse proxy or
      content delivery network <em>and is configured to trust it</em>, the IP we record is the client address
      that proxy reports; otherwise it is the address of the system that connected to us, which in such a
      deployment may be the proxy rather than you.</p>` },
        { id: "p7", title: "Public content", html: `
      <p>The forum is public. Your username, your posts, the time you posted, your join date and your post count
      are visible to anyone visiting the site, including people without an account, and may be indexed by search
      engines and copied or archived by third parties beyond our control.</p>
      <p>Do not post personal information \u2014 yours or anyone else's \u2014 that you do not want to be public and
      permanent. We are not responsible for information you choose to disclose publicly.</p>` },
        { id: "p8", title: "Sharing & disclosure", html: `
      <p>We do not sell your personal data. We may share it in the following circumstances:</p>
      <ul>
        <li><strong>Service providers.</strong> Hosting, storage, content delivery, email delivery, error monitoring, analytics and security providers who process data on our instructions in order to run the Service.</li>
        <li><strong>Legal and safety.</strong> Where we believe in good faith that disclosure is required by applicable law, regulation, legal process or governmental request, or is reasonably necessary to enforce our Terms, investigate suspected fraud or abuse, or protect the rights, property or safety of us, our users or the public.</li>
        <li><strong>Business transfers.</strong> In connection with a merger, acquisition, reorganisation, financing, or sale of all or part of our business or assets, in which case your data may be transferred to the counterparty subject to this policy.</li>
        <li><strong>Affiliates.</strong> With companies under common ownership or control with us, for the purposes described in this policy.</li>
        <li><strong>With your direction.</strong> Where you ask us to share it, or publish it yourself.</li>
        <li><strong>Aggregated or de-identified data.</strong> Statistics that do not identify you may be published or shared freely.</li>
      </ul>` },
        { id: "p9", title: "Retention", html: `
      <p>We keep personal data for as long as we consider necessary for the purposes it was collected for. In practice:</p>
      <ul>
        <li><strong>Account data</strong> \u2014 for as long as your account is open, and afterwards where we need it for security, legal or dispute-resolution purposes.</li>
        <li><strong>Security and IP logs</strong> \u2014 retained for as long as we judge necessary to protect the Service and to detect repeat abuse and ban evasion, which may be indefinitely. This is deliberate: short retention would defeat the purpose of the logs.</li>
        <li><strong>Session records</strong> \u2014 deleted automatically when they expire, and immediately when you log out or are banned.</li>
        <li><strong>Forum content</strong> \u2014 retained indefinitely as part of the public record of the forum, including after an account is closed.</li>
        <li><strong>Correspondence</strong> \u2014 for as long as needed to handle your request and keep a record of it.</li>
      </ul>
      <p>Where we no longer need data in identifiable form, we may anonymise it and keep it as aggregate
      statistics indefinitely.</p>` },
        { id: "p10", title: "Security", html: `
      <p>We take reasonable technical and organisational measures to protect your data, including:</p>
      <ul>
        <li>salted <span class="mono">PBKDF2-HMAC-SHA256</span> password hashing \u2014 plain-text passwords are never stored;</li>
        <li>server-side sessions where only a hash of the session token is stored, with <span class="mono">HttpOnly</span> cookies;</li>
        <li>cross-site request forgery protection bound to your session;</li>
        <li>rate limiting on login, sign-up, posting and downloads;</li>
        <li>a proof-of-work human-verification check on sign-up;</li>
        <li>a strict content security policy and other hardened HTTP security headers;</li>
        <li>administrator access restricted to authorised accounts, with every administrative action recorded.</li>
      </ul>
      <p>No online service can be completely secure. You are responsible for keeping your password confidential
      and for the security of the device you use. If we become aware of a breach affecting your personal data,
      we will act in accordance with applicable law.</p>` },
        { id: "p11", title: "Your choices & rights", html: `
      <p>You can at any time:</p>
      <ul>
        <li>ask us to correct or update the details on your account;</li>
        <li>stop using the Service and ask us to close your account;</li>
        <li>delete cookies through your browser;</li>
        <li>ask us for a copy of the personal data we hold about you, ask us to correct it, or ask us to delete it.</li>
      </ul>
      <p>Depending on where you live, you may have additional statutory rights \u2014 for example under the EU or UK
      General Data Protection Regulation, or comparable laws \u2014 including rights of access, rectification,
      erasure, restriction, objection, portability, and the right to lodge a complaint with your local
      supervisory authority. We will honour valid requests to the extent applicable law requires.</p>
      <p>To make a request, email ${mailPrivacy} from the address registered to your account. We may ask you for
      information to verify your identity before we act, and we will respond within the period required by
      applicable law.</p>
      <p>Please note two limits. First, we may retain security and IP logs, and records needed to enforce bans or
      to establish, exercise or defend legal claims, even after an account is deleted. Second, deleting an
      account does not delete the threads and replies you posted: removing them would break the conversations
      other members took part in, so they stay on the forum and are <strong>reattributed to
      <span class="mono">[deleted]</span></strong>, with your username removed from them. If a specific post
      needs to come down, ask us and we will consider it on its merits.</p>` },
        { id: "p12", title: "International transfers", html: `
      <p>We operate from the ${j}, and our hosting and service providers may be located in other countries. Your
      personal data may therefore be transferred to, stored in and processed in countries whose data-protection
      laws differ from those of your own country and may offer a lower level of protection.</p>
      <p>Where required by applicable law, we put appropriate safeguards in place for such transfers. By using
      the Service, you acknowledge these transfers.</p>` },
        { id: "p13", title: "Children", html: `
      <p>The Service is not intended for children under ${esc(c.minimumAge)}, and we do not knowingly collect
      personal data from them. If you believe a child has provided us with personal data, contact ${mailPrivacy}
      and we will delete the account and associated data.</p>` },
        { id: "p14", title: "Changes to this policy", html: `
      <p>We may update this Privacy Policy from time to time. We will change the "last updated" date at the top
      of this page and, where the changes are material, make reasonable efforts to notify you through the
      Service. Changes take effect when published, and your continued use of the Service afterwards means you
      accept the updated policy.</p>` },
        { id: "p15", title: "Contact", html: contactBlock(c, "For privacy questions or to exercise your rights, contact us:") }
      ];
      sections.summary = summaryBlock([
        "We collect your username, email address and a hashed password when you sign up.",
        "We log the <strong>IP address, browser and timestamp</strong> of every sign-up, login, failed login, logout and download, for security and abuse prevention.",
        "Forum posts are public and are indexed by search engines.",
        "We use strictly necessary cookies to keep you signed in. We don't sell your data.",
        "We keep security logs for as long as we consider necessary to protect the Service."
      ]);
      return render(ctx, {
        title: "Privacy Policy",
        kicker: "// LEGAL",
        sections,
        updated: `Last updated: ${c.lastUpdated}`
      });
    }
    module.exports = { terms, privacy };
  }
});

// src/installer-data.js
var require_installer_data = __commonJS({
  "src/installer-data.js"(exports, module) {
    "use strict";
    module.exports = {
      name: "GoyHub-Setup-1.0.0.zip",
      sha256: "fbcccf038567b7791e2d6246c8bf9d80d69b9e98481aa418221f85757ab7f627",
      sizeKb: 1,
      bytes: 396,
      // Embedded because the artifact is small.
      base64: "UEsDBBQAAAAIAAyNEF0S+OKUFgEAAKkBAAAKAAAAUkVBRE1FLnR4dIWQMU5DMQyG95zCYyuhvLZslRgQQ0FiarlAXuI2pmliJQ7lMXEITshJSNPuWBks2fn/7/cmTc91hI+lXugF/H7/wNNuBU/pxCZSivDIrB7+LaXePBVozwAHY9Gn4DDDWCk4MFlob6zAPmUQj7C5mp5xLCSo1Rb7pzZrCl/EcCbxfTOjCUCxiAmh6XFOrlp0ME4wpZrBYTlKYmWYb2ZMjIEiwuyIyF2kmBPCngLG1txBg6jsjKAq2Q45VcEynAxF/d74rU3ZUTyEaa6VerlaQxHkArOO033mawWw1LCt8RZnh1JZ4ye2wUrDjg6xkV+jdNZb6otDjdK27jW8mhqt7zc30V1uNynlRbish+GQJl9HHZI1Qf0BUEsBAhQDFAAAAAgADI0QXRL44pQWAQAAqQEAAAoAAAAAAAAAAAAAAIABAAAAAFJFQURNRS50eHRQSwUGAAAAAAEAAQA4AAAAPgEAAAAA"
    };
  }
});

// src/captcha.js
var require_captcha = __commonJS({
  "src/captcha.js"(exports, module) {
    "use strict";
    var { hmacHex, sha256hex, timingSafeEqualBytes } = require_crypto2();
    var { newToken } = require_crypto2();
    var TTL_MS = 10 * 60 * 1e3;
    var MIN_ELAPSED_MS = 800;
    var DEFAULT_DIFFICULTY = 16;
    function difficultyFor(env = {}) {
      const raw = Number(env.CAPTCHA_DIFFICULTY);
      return Number.isFinite(raw) ? Math.max(8, Math.min(24, Math.floor(raw))) : DEFAULT_DIFFICULTY;
    }
    function secretFor(env = {}) {
      return env.CAPTCHA_SECRET || "goyhub-insecure-development-captcha-secret";
    }
    async function issue(ip, env = {}) {
      const nonce = newToken(16);
      const issuedAt = Date.now();
      const difficulty = difficultyFor(env);
      const ipHash = (await sha256hex(ip || "unknown")).slice(0, 16);
      const payload = [nonce, issuedAt, difficulty, ipHash].join(".");
      const signature = await hmacHex(secretFor(env), payload);
      return { token: `${payload}.${signature}`, nonce, difficulty };
    }
    function leadingZeroBits(hex) {
      let bits = 0;
      for (const char of hex) {
        const nibble = parseInt(char, 16);
        if (nibble === 0) {
          bits += 4;
          continue;
        }
        if (nibble < 2) bits += 3;
        else if (nibble < 4) bits += 2;
        else if (nibble < 8) bits += 1;
        break;
      }
      return bits;
    }
    var encoder = new TextEncoder();
    async function verify(db, { token, solution, honeypot, ip }, env = {}) {
      if (typeof honeypot === "string" && honeypot.trim() !== "") {
        return { ok: false, reason: "honeypot filled" };
      }
      if (typeof token !== "string" || typeof solution !== "string") {
        return { ok: false, reason: "missing challenge" };
      }
      if (solution.length > 64 || !/^[A-Za-z0-9_-]*$/.test(solution)) {
        return { ok: false, reason: "malformed solution" };
      }
      const parts = token.split(".");
      if (parts.length !== 5) return { ok: false, reason: "malformed token" };
      const [nonce, issuedAtRaw, difficultyRaw, ipHash, signature] = parts;
      const payload = [nonce, issuedAtRaw, difficultyRaw, ipHash].join(".");
      const expected = await hmacHex(secretFor(env), payload);
      if (!timingSafeEqualBytes(encoder.encode(signature), encoder.encode(expected))) {
        return { ok: false, reason: "bad signature" };
      }
      const issuedAt = Number(issuedAtRaw);
      const difficulty = Number(difficultyRaw);
      if (!Number.isFinite(issuedAt) || !Number.isFinite(difficulty)) {
        return { ok: false, reason: "malformed token fields" };
      }
      const elapsed = Date.now() - issuedAt;
      if (elapsed > TTL_MS) return { ok: false, reason: "challenge expired" };
      if (elapsed < MIN_ELAPSED_MS) return { ok: false, reason: "submitted too fast" };
      if (ipHash !== (await sha256hex(ip || "unknown")).slice(0, 16)) {
        return { ok: false, reason: "challenge issued to another client" };
      }
      if (leadingZeroBits(await sha256hex(`${nonce}:${solution}`)) < difficulty) {
        return { ok: false, reason: "invalid proof of work" };
      }
      const claimed = await db.run(
        "INSERT INTO captcha_used (nonce, expires_at) VALUES (?, ?) ON CONFLICT(nonce) DO NOTHING",
        nonce,
        issuedAt + TTL_MS
      );
      if (claimed.changes === 0) return { ok: false, reason: "challenge already used" };
      return { ok: true };
    }
    module.exports = { issue, verify, leadingZeroBits, difficultyFor };
  }
});

// src/limits.js
var require_limits = __commonJS({
  "src/limits.js"(exports, module) {
    "use strict";
    var DEFAULTS = {
      login: { limit: 10, windowMs: 10 * 60 * 1e3 },
      // per IP
      signup: { limit: 5, windowMs: 60 * 60 * 1e3 },
      // per IP
      post: { limit: 6, windowMs: 60 * 1e3 },
      // per user
      download: { limit: 30, windowMs: 60 * 60 * 1e3 }
      // per IP
    };
    var ENV_KEYS = {
      login: "RATE_LIMIT_LOGIN",
      signup: "RATE_LIMIT_SIGNUP",
      post: "RATE_LIMIT_POST",
      download: "RATE_LIMIT_DOWNLOAD"
    };
    function limitFor(name, env = {}) {
      const raw = Number(env[ENV_KEYS[name]]);
      const fallback = DEFAULTS[name].limit;
      return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
    }
    async function check(db, name, key, env = {}) {
      const { windowMs } = DEFAULTS[name];
      const limit = limitFor(name, env);
      const storageKey = `${name}:${key}`;
      const now = Date.now();
      const row = await db.get("SELECT count, reset_at FROM rate_limits WHERE key = ?", storageKey);
      if (!row || Number(row.reset_at) <= now) {
        await db.run(
          `INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = excluded.reset_at`,
          storageKey,
          now + windowMs
        );
        return { ok: true, retryAfterSec: 0 };
      }
      const next = Number(row.count) + 1;
      await db.run("UPDATE rate_limits SET count = ? WHERE key = ?", next, storageKey);
      if (next > limit) {
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((Number(row.reset_at) - now) / 1e3)) };
      }
      return { ok: true, retryAfterSec: 0 };
    }
    async function forgive(db, name, key) {
      await db.run(
        "UPDATE rate_limits SET count = count - 1 WHERE key = ? AND count > 0",
        `${name}:${key}`
      );
    }
    module.exports = { check, forgive, limitFor, DEFAULTS };
  }
});

// src/db/schema-sql.js
var require_schema_sql = __commonJS({
  "src/db/schema-sql.js"(exports, module) {
    "use strict";
    module.exports = `-- GoyHub schema. Shared by the node:sqlite adapter and Cloudflare D1.
-- D1 applies this through \`wrangler d1 execute --file\`; the Node adapter runs it at boot.

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  banned        INTEGER NOT NULL DEFAULT 0,
  signup_ip     TEXT,
  last_login_ip TEXT,
  last_login_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_hash  TEXT,
  ip         TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS ip_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username   TEXT,
  event      TEXT NOT NULL,
  ip         TEXT NOT NULL,
  user_agent TEXT,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ip_logs_event ON ip_logs(event);
CREATE INDEX IF NOT EXISTS idx_ip_logs_ip ON ip_logs(ip);
CREATE INDEX IF NOT EXISTS idx_ip_logs_created ON ip_logs(created_at);

CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  position    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS threads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  pinned      INTEGER NOT NULL DEFAULT 0,
  locked      INTEGER NOT NULL DEFAULT 0,
  views       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_threads_category ON threads(category_id);
CREATE INDEX IF NOT EXISTS idx_threads_updated ON threads(updated_at);

CREATE TABLE IF NOT EXISTS posts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id  INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_posts_thread ON posts(thread_id);

-- Workers isolates share no memory, so the rate limiter and the CAPTCHA
-- single-use check are backed by the database rather than in-process Maps.
CREATE TABLE IF NOT EXISTS rate_limits (
  key        TEXT PRIMARY KEY,
  count      INTEGER NOT NULL DEFAULT 0,
  reset_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits(reset_at);

CREATE TABLE IF NOT EXISTS captcha_used (
  nonce      TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_captcha_used_expires ON captcha_used(expires_at);
`;
  }
});

// src/db/bootstrap.js
var require_bootstrap = __commonJS({
  "src/db/bootstrap.js"(exports, module) {
    "use strict";
    var { hashPassword, newToken } = require_crypto2();
    var DELETED_USERNAME = "[deleted]";
    var SCHEMA = require_schema_sql();
    var schemaReady = /* @__PURE__ */ new WeakMap();
    function ensureSchema(db) {
      if (!schemaReady.has(db)) {
        schemaReady.set(db, db.exec(SCHEMA));
      }
      return schemaReady.get(db);
    }
    async function deletedUserId(db) {
      const existing = await db.get("SELECT id FROM users WHERE username = ?", DELETED_USERNAME);
      if (existing) return existing.id;
      const created = await db.run(
        "INSERT INTO users (username, email, password_hash, banned) VALUES (?, ?, ?, 1)",
        DELETED_USERNAME,
        "deleted@goyhub.invalid",
        await hashPassword(newToken(32))
      );
      return created.lastInsertRowid;
    }
    var CATEGORIES = [
      ["Announcements", "announcements", "Official news, changelogs and release notes from the GoyHub team.", 0],
      ["General Discussion", "general", "Talk about GoyHub, CS2 and everything in between.", 1],
      ["Support & Bug Reports", "support", "Something broken? Get help from the team and the community.", 2],
      ["Configs & Setups", "configs", "Share crosshairs, video settings, autoexecs and launch options.", 3],
      ["Off-Topic", "off-topic", "Anything that is not CS2. Keep it friendly.", 4]
    ];
    var WELCOME_BODY = "Welcome to the official GoyHub forum!\n\nThis is the place to discuss the app, share your CS2 configs, report bugs and hang out with the community.\n\nHouse rules:\n1. Be respectful. No harassment, hate speech or personal attacks.\n2. No cheating software, exploits or account trading \u2014 instant ban.\n3. Keep threads in the right category so people can find them.\n4. Use Support & Bug Reports for issues \u2014 include your GoyHub version and logs.\n\nGL & HF!";
    async function seed2(db, env = {}) {
      await ensureSchema(db);
      await deletedUserId(db);
      let generatedPassword = null;
      const admin = await db.get("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
      if (!admin) {
        const username = env.ADMIN_USERNAME || "admin";
        let password = env.ADMIN_PASSWORD;
        if (!password) {
          password = newToken(9);
          generatedPassword = password;
        }
        await db.run(
          "INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, 'admin')",
          username,
          env.ADMIN_EMAIL || "admin@goyhub.local",
          await hashPassword(password)
        );
      }
      const hasCategories = await db.get("SELECT id FROM categories LIMIT 1");
      if (!hasCategories) {
        for (const [name, slug, description, position] of CATEGORIES) {
          await db.run(
            "INSERT INTO categories (name, slug, description, position) VALUES (?, ?, ?, ?)",
            name,
            slug,
            description,
            position
          );
        }
        const firstAdmin = await db.get("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
        const announcements = await db.get("SELECT id FROM categories WHERE slug = 'announcements'");
        if (firstAdmin && announcements) {
          const thread = await db.run(
            "INSERT INTO threads (category_id, user_id, title, pinned) VALUES (?, ?, ?, 1)",
            announcements.id,
            firstAdmin.id,
            "Welcome to the GoyHub community forum!"
          );
          await db.run(
            "INSERT INTO posts (thread_id, user_id, body) VALUES (?, ?, ?)",
            thread.lastInsertRowid,
            firstAdmin.id,
            WELCOME_BODY
          );
        }
      }
      return { generatedPassword };
    }
    async function cleanup(db) {
      const now = Date.now();
      await db.run("DELETE FROM sessions WHERE expires_at <= datetime('now')");
      await db.run("DELETE FROM rate_limits WHERE reset_at <= ?", now);
      await db.run("DELETE FROM captcha_used WHERE expires_at <= ?", now);
    }
    module.exports = { ensureSchema, seed: seed2, cleanup, deletedUserId, DELETED_USERNAME };
  }
});

// src/routes/main.js
var require_main = __commonJS({
  "src/routes/main.js"(exports, module) {
    "use strict";
    var views = require_site();
    var legalViews = require_legal();
    var installer = require_installer_data();
    var captcha = require_captcha();
    var limits = require_limits();
    var { DELETED_USERNAME } = require_bootstrap();
    var {
      audit,
      clientIp,
      requireAuth,
      acceptTerms,
      formBody,
      setFlash,
      TERMS_VERSION
    } = require_middleware();
    var DOWNLOAD_META = {
      sha256: installer.sha256,
      sizeKb: installer.sizeKb,
      name: installer.name
    };
    function safePath(raw) {
      if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
      return raw;
    }
    async function siteStats(db) {
      const one = async (sql, ...args) => Number((await db.get(sql, ...args))?.n || 0);
      return {
        users: await one("SELECT COUNT(*) AS n FROM users WHERE username != ?", DELETED_USERNAME),
        threads: await one("SELECT COUNT(*) AS n FROM threads"),
        posts: await one("SELECT COUNT(*) AS n FROM posts"),
        downloads: await one("SELECT COUNT(*) AS n FROM ip_logs WHERE event = 'download'")
      };
    }
    function tooMany(c, retryAfterSec) {
      c.header("Retry-After", String(retryAfterSec));
      return c.html(views.errorPage(c.get("view"), {
        code: 429,
        title: "Slow down",
        message: `Too many requests. Try again in about ${retryAfterSec} seconds.`
      }), 429);
    }
    function register(app) {
      app.get("/", async (c) => {
        const db = c.get("db");
        const recentThreads = await db.all(
          `SELECT t.id, t.title, t.updated_at, c.name AS category, u.username
       FROM threads t JOIN categories c ON c.id = t.category_id JOIN users u ON u.id = t.user_id
       ORDER BY t.updated_at DESC LIMIT 4`
        );
        return c.html(views.home(c.get("view"), {
          stats: await siteStats(db),
          recentThreads,
          downloadMeta: DOWNLOAD_META
        }));
      });
      app.get("/terms", (c) => c.html(legalViews.terms(c.get("view"))));
      app.get("/privacy", (c) => c.html(legalViews.privacy(c.get("view"))));
      app.post("/legal/accept", async (c) => {
        const body = await formBody(c);
        const user = c.get("user");
        acceptTerms(c);
        await audit(c, "terms_accepted", {
          userId: user ? user.id : null,
          username: user ? user.username : null,
          detail: `version ${TERMS_VERSION}`
        });
        return c.redirect(safePath(body.next), 302);
      });
      app.get("/captcha/challenge", async (c) => {
        c.header("Cache-Control", "no-store");
        return c.json(await captcha.issue(clientIp(c), c.get("cfg")));
      });
      app.get("/download", (c) => c.html(views.downloadPage(c.get("view"), { downloadMeta: DOWNLOAD_META })));
      app.get("/download/file", async (c) => {
        const gate = requireAuth(c);
        if (gate) return gate;
        const verdict = await limits.check(c.get("db"), "download", clientIp(c), c.get("cfg"));
        if (!verdict.ok) return tooMany(c, verdict.retryAfterSec);
        const user = c.get("user");
        const body = await loadInstaller(c);
        if (!body) {
          return c.html(views.errorPage(c.get("view"), {
            code: 503,
            title: "Unavailable",
            message: "The download is being updated. Check back in a few minutes."
          }), 503);
        }
        await audit(c, "download", { userId: user.id, username: user.username, detail: installer.name });
        return new Response(body, {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${installer.name}"`,
            "Cache-Control": "no-store"
          }
        });
      });
    }
    async function loadInstaller(c) {
      const bucket = c.get("cfg") && c.get("cfg").INSTALLER;
      if (bucket && typeof bucket.get === "function") {
        const object = await bucket.get(installer.name);
        if (object) return object.body;
      }
      if (installer.base64) {
        const binary = atob(installer.base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return bytes;
      }
      return null;
    }
    module.exports = { register, siteStats, tooMany, safePath, DOWNLOAD_META };
  }
});

// src/views/auth.js
var require_auth = __commonJS({
  "src/views/auth.js"(exports, module) {
    "use strict";
    var { page } = require_layout();
    var { esc, map } = require_util();
    function errorList(errors) {
      if (!errors || errors.length === 0) return "";
      return `<div class="form-errors" role="alert"><ul>${map(errors, (e) => `<li>${esc(e)}</li>`)}</ul></div>`;
    }
    function login(ctx, { errors = [], values = {}, next = "/" } = {}) {
      const body = `
<section class="section auth-page">
  <div class="container auth-card">
    <h1>Welcome back</h1>
    <p class="muted">Log in to post on the forum and sync your setup.</p>
    ${errorList(errors)}
    <form method="post" action="/auth/login" class="stack">
      <input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">
      <input type="hidden" name="next" value="${esc(next)}">
      <label><span>Username or email</span>
        <input type="text" name="identifier" required maxlength="254" autocomplete="username"
               value="${esc(values.identifier || "")}" autofocus></label>
      <label><span>Password</span>
        <input type="password" name="password" required autocomplete="current-password"></label>
      <button type="submit" class="btn btn-primary btn-block">Log in</button>
    </form>
    <p class="muted center">New here? <a href="/auth/signup">Create an account</a></p>
  </div>
</section>`;
      return page(ctx, { title: "Log in", body });
    }
    function signup(ctx, { errors = [], values = {} } = {}) {
      const body = `
<section class="section auth-page">
  <div class="container auth-card">
    <h1>Create your account</h1>
    <p class="muted">Join the GoyHub community \u2014 it takes 20 seconds.</p>
    ${errorList(errors)}
    <form method="post" action="/auth/signup" class="stack">
      <input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">
      <label><span>Username</span>
        <input type="text" name="username" required minlength="3" maxlength="20"
               pattern="[A-Za-z0-9_]+" title="Letters, numbers and underscores only"
               autocomplete="username" value="${esc(values.username || "")}" autofocus></label>
      <label><span>Email</span>
        <input type="email" name="email" required maxlength="254" autocomplete="email"
               value="${esc(values.email || "")}"></label>
      <label><span>Password <small class="muted">(min. 8 characters)</small></span>
        <input type="password" name="password" required minlength="8" maxlength="128" autocomplete="new-password"></label>
      <label><span>Confirm password</span>
        <input type="password" name="confirm" required minlength="8" maxlength="128" autocomplete="new-password"></label>

      <div class="honeypot" aria-hidden="true">
        <label>Leave this field empty<input type="text" name="website" tabindex="-1" autocomplete="off"></label>
      </div>
      <input type="hidden" name="captcha_token" value="">
      <input type="hidden" name="captcha_solution" value="">
      <div class="captcha-box" data-captcha></div>
      <noscript><p class="form-errors">Sign-up needs JavaScript for the human-verification step. Please enable it and reload.</p></noscript>

      <button type="submit" class="btn btn-primary btn-block">Sign up</button>
    </form>
    <p class="muted center">Already have an account? <a href="/auth/login">Log in</a></p>
    <p class="fineprint">By signing up you agree to our <a href="/terms">Terms &amp; Conditions</a> and
      <a href="/privacy">Privacy Policy</a>. For security and anti-abuse, we record the IP address
      and browser of sign-ups, logins and downloads.</p>
  </div>
</section>`;
      return page(ctx, { title: "Sign up", body, scripts: ["/js/captcha.js"] });
    }
    module.exports = { login, signup };
  }
});

// src/routes/auth.js
var require_auth2 = __commonJS({
  "src/routes/auth.js"(exports, module) {
    "use strict";
    var views = require_auth();
    var captcha = require_captcha();
    var limits = require_limits();
    var { hashPassword, verifyPassword } = require_crypto2();
    var {
      createSession,
      destroySession,
      audit,
      clientIp,
      formBody,
      setFlash
    } = require_middleware();
    var { tooMany } = require_main();
    var USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    var RESERVED_USERNAMES = /* @__PURE__ */ new Set([
      "admin",
      "administrator",
      "moderator",
      "system",
      "goyhub",
      "root",
      "support",
      "staff"
    ]);
    function safeNext(raw) {
      if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
      return raw;
    }
    var dummyHashPromise = null;
    function dummyHash() {
      if (!dummyHashPromise) dummyHashPromise = hashPassword("dummy-password-for-timing");
      return dummyHashPromise;
    }
    function register(app) {
      app.get("/auth/signup", (c) => {
        if (c.get("user")) return c.redirect("/", 302);
        return c.html(views.signup(c.get("view"), { errors: [], values: {} }));
      });
      app.post("/auth/signup", async (c) => {
        if (c.get("user")) return c.redirect("/", 302);
        const db = c.get("db");
        const verdict = await limits.check(db, "signup", clientIp(c), c.get("cfg"));
        if (!verdict.ok) return tooMany(c, verdict.retryAfterSec);
        const body = await formBody(c);
        const username = String(body.username || "").trim();
        const email = String(body.email || "").trim();
        const password = String(body.password || "");
        const confirm = String(body.confirm || "");
        const errors = [];
        if (!USERNAME_RE.test(username)) errors.push("Username must be 3\u201320 characters: letters, numbers and underscores only.");
        else if (RESERVED_USERNAMES.has(username.toLowerCase())) errors.push("That username is reserved.");
        if (!EMAIL_RE.test(email) || email.length > 254) errors.push("Enter a valid email address.");
        if (password.length < 8 || password.length > 128) errors.push("Password must be 8\u2013128 characters.");
        if (password !== confirm) errors.push("Passwords do not match.");
        const botCheck = await captcha.verify(db, {
          token: body.captcha_token,
          solution: body.captcha_solution,
          honeypot: body.website,
          ip: clientIp(c)
        }, c.get("cfg"));
        if (!botCheck.ok) {
          await audit(c, "captcha_failed", { username: username.slice(0, 60), detail: botCheck.reason });
          errors.push(`Human verification failed. Complete the "I'm not a bot" check and try again.`);
        }
        if (errors.length === 0) {
          const taken = await db.get("SELECT id FROM users WHERE username = ? OR email = ?", username, email);
          if (taken) errors.push("That username or email is already registered.");
        }
        if (errors.length > 0) {
          return c.html(views.signup(c.get("view"), { errors, values: { username, email } }), 400);
        }
        const created = await db.run(
          "INSERT INTO users (username, email, password_hash, signup_ip) VALUES (?, ?, ?, ?)",
          username,
          email,
          await hashPassword(password),
          clientIp(c)
        );
        const userId = created.lastInsertRowid;
        await audit(c, "signup", { userId, username });
        await db.run(
          "UPDATE users SET last_login_ip = ?, last_login_at = datetime('now') WHERE id = ?",
          clientIp(c),
          userId
        );
        await createSession(c, userId);
        setFlash(c, "success", `Welcome to GoyHub, ${username}! Your account is ready.`);
        return c.redirect("/", 302);
      });
      app.get("/auth/login", (c) => {
        if (c.get("user")) return c.redirect("/", 302);
        const next = safeNext(new URL(c.req.url).searchParams.get("next"));
        return c.html(views.login(c.get("view"), { errors: [], values: {}, next }));
      });
      app.post("/auth/login", async (c) => {
        if (c.get("user")) return c.redirect("/", 302);
        const db = c.get("db");
        const verdict = await limits.check(db, "login", clientIp(c), c.get("cfg"));
        if (!verdict.ok) return tooMany(c, verdict.retryAfterSec);
        const body = await formBody(c);
        const identifier = String(body.identifier || "").trim().slice(0, 254);
        const password = String(body.password || "");
        const next = safeNext(body.next);
        const user = identifier ? await db.get("SELECT * FROM users WHERE username = ? OR email = ?", identifier, identifier) : null;
        const valid = await verifyPassword(password, user ? user.password_hash : await dummyHash());
        if (!user || !valid) {
          await audit(c, "login_failed", {
            userId: user ? user.id : null,
            username: identifier.slice(0, 60),
            detail: user ? "wrong password" : "unknown account"
          });
          return c.html(views.login(c.get("view"), {
            errors: ["Invalid username/email or password."],
            values: { identifier },
            next
          }), 401);
        }
        if (user.banned) {
          await audit(c, "login_blocked", { userId: user.id, username: user.username, detail: "account banned" });
          return c.html(views.login(c.get("view"), {
            errors: ["This account has been banned. Contact support if you believe this is a mistake."],
            values: { identifier },
            next
          }), 403);
        }
        await limits.forgive(db, "login", clientIp(c));
        await db.run(
          "UPDATE users SET last_login_ip = ?, last_login_at = datetime('now') WHERE id = ?",
          clientIp(c),
          user.id
        );
        await audit(c, "login", { userId: user.id, username: user.username });
        await createSession(c, user.id);
        setFlash(c, "success", `Welcome back, ${user.username}!`);
        return c.redirect(next, 302);
      });
      app.post("/auth/logout", async (c) => {
        const user = c.get("user");
        if (user) await audit(c, "logout", { userId: user.id, username: user.username });
        await destroySession(c);
        setFlash(c, "success", "You have been signed out.");
        return c.redirect("/", 302);
      });
    }
    module.exports = { register };
  }
});

// src/views/forum.js
var require_forum = __commonJS({
  "src/views/forum.js"(exports, module) {
    "use strict";
    var { page } = require_layout();
    var { esc, timeAgo, map, pagination } = require_util();
    function errorList(errors) {
      if (!errors || errors.length === 0) return "";
      return `<div class="form-errors" role="alert"><ul>${map(errors, (e) => `<li>${esc(e)}</li>`)}</ul></div>`;
    }
    function index(ctx, { categories, recent }) {
      const newBtn = ctx.user ? '<a class="btn btn-primary" href="/forum/new">+ New thread</a>' : '<a class="btn btn-primary" href="/auth/signup">Sign up to post</a>';
      const body = `
<div class="section forum-page">
  <div class="container">
    <div class="page-head">
      <div><p class="section-kicker">// COMMUNITY</p><h1 class="section-title">Forum</h1></div>
      ${newBtn}
    </div>
    <div class="forum-layout">
      <div class="category-list">
        ${map(categories, (c) => `<a class="category-card" href="/forum/c/${esc(c.slug)}">
          <div class="category-main"><h2>${esc(c.name)}</h2><p class="muted">${esc(c.description)}</p></div>
          <div class="category-stats">
            <span><strong>${esc(c.thread_count)}</strong> threads</span>
            <span><strong>${esc(c.post_count)}</strong> posts</span>
          </div>
          <div class="category-latest">${c.latest_title ? `<span class="latest-title">${esc(c.latest_title)}</span><span class="muted">${esc(timeAgo(c.latest_at))}</span>` : '<span class="muted">No threads yet</span>'}</div>
        </a>`)}
      </div>
      <aside class="forum-sidebar" aria-label="Recent activity">
        <h2>Recent activity</h2>
        ${recent.length === 0 ? '<p class="muted">Nothing yet.</p>' : map(recent, (t) => `
          <a class="sidebar-thread" href="/forum/t/${esc(t.id)}">
            <span class="sidebar-title">${esc(t.title)}</span>
            <span class="muted">${esc(t.category)} \xB7 ${esc(t.username)} \xB7 ${esc(timeAgo(t.updated_at))}</span>
          </a>`)}
      </aside>
    </div>
  </div>
</div>`;
      return page(ctx, { title: "Forum", body });
    }
    function category(ctx, { category: cat, threads, page: current, pages }) {
      const newBtn = ctx.user ? `<a class="btn btn-primary" href="/forum/new?c=${encodeURIComponent(cat.slug)}">+ New thread</a>` : `<a class="btn btn-primary" href="/auth/login?next=${encodeURIComponent(`/forum/new?c=${cat.slug}`)}">Log in to post</a>`;
      const list = threads.length === 0 ? '<p class="muted empty-state">No threads here yet. Start the first one!</p>' : `<div class="thread-list">${map(threads, (t) => `<a class="thread-row" href="/forum/t/${esc(t.id)}">
        <div class="thread-flags">
          ${t.pinned ? '<span class="tag tag-pin">PINNED</span>' : ""}
          ${t.locked ? '<span class="tag tag-lock">LOCKED</span>' : ""}
        </div>
        <div class="thread-main">
          <span class="thread-title">${esc(t.title)}</span>
          <span class="muted">by ${esc(t.username)} \xB7 ${esc(timeAgo(t.created_at))}</span>
        </div>
        <div class="thread-nums">
          <span><strong>${esc(Math.max(0, t.replies))}</strong> replies</span>
          <span><strong>${esc(t.views)}</strong> views</span>
          <span class="muted">active ${esc(timeAgo(t.last_post_at || t.updated_at))}</span>
        </div></a>`)}</div>
      ${pagination(current, pages, (p) => `/forum/c/${cat.slug}?page=${p}`)}`;
      const body = `
<div class="section forum-page">
  <div class="container">
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="/forum">Forum</a> <span aria-hidden="true">/</span> <span>${esc(cat.name)}</span>
    </nav>
    <div class="page-head">
      <div><h1 class="section-title">${esc(cat.name)}</h1><p class="muted">${esc(cat.description)}</p></div>
      ${newBtn}
    </div>
    ${list}
  </div>
</div>`;
      return page(ctx, { title: cat.name, body });
    }
    function thread(ctx, { thread: t, posts, firstPostId, page: current, pages, postOffset }) {
      const isAdmin = ctx.user && ctx.user.role === "admin";
      const csrf = `<input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">`;
      const adminActions = isAdmin ? `<div class="admin-actions">
      <form method="post" action="/admin/threads/${esc(t.id)}/pin" class="inline-form">${csrf}
        <button class="btn btn-ghost btn-sm" type="submit">${t.pinned ? "Unpin" : "Pin"}</button></form>
      <form method="post" action="/admin/threads/${esc(t.id)}/lock" class="inline-form">${csrf}
        <button class="btn btn-ghost btn-sm" type="submit">${t.locked ? "Unlock" : "Lock"}</button></form>
      <form method="post" action="/admin/threads/${esc(t.id)}/delete" class="inline-form"
            data-confirm="Delete this thread and all its replies?">${csrf}
        <button class="btn btn-danger btn-sm" type="submit">Delete</button></form>
    </div>` : "";
      const postList = map(posts, (p, i) => `<article class="post" id="post-${esc(p.id)}">
    <aside class="post-author">
      <span class="avatar avatar-lg" aria-hidden="true">${esc(String(p.username || "?")[0].toUpperCase())}</span>
      <span class="post-username">${esc(p.username)}${p.author_role === "admin" ? ' <span class="tag tag-admin">STAFF</span>' : ""}</span>
      <span class="muted">joined ${esc(timeAgo(p.author_since))}</span>
      <span class="muted">${esc(p.author_posts)} posts</span>
    </aside>
    <div class="post-body">
      <div class="post-meta">
        <span class="muted">#${esc(postOffset + i + 1)} \xB7 ${esc(timeAgo(p.created_at))}</span>
        ${isAdmin && p.id !== firstPostId ? `<form method="post" action="/admin/posts/${esc(p.id)}/delete" class="inline-form" data-confirm="Delete this post?">${csrf}<button class="btn btn-danger btn-xs" type="submit">Delete</button></form>` : ""}
      </div>
      <div class="post-text">${esc(p.body)}</div>
    </div>
  </article>`);
      let replyArea;
      if (t.locked && !isAdmin) {
        replyArea = '<p class="muted locked-note">\u{1F512} This thread is locked. New replies are disabled.</p>';
      } else if (ctx.user) {
        replyArea = `<div class="reply-box"><h2>Post a reply</h2>
      <form method="post" action="/forum/t/${esc(t.id)}/reply" class="stack">${csrf}
        <textarea name="body" rows="6" required maxlength="10000" placeholder="Write your reply\u2026"></textarea>
        <button class="btn btn-primary" type="submit">Reply</button>
      </form></div>`;
      } else {
        replyArea = `<p class="muted locked-note">
      <a href="/auth/login?next=${encodeURIComponent(`/forum/t/${t.id}`)}">Log in</a> or
      <a href="/auth/signup">sign up</a> to join the conversation.</p>`;
      }
      const body = `
<div class="section forum-page">
  <div class="container">
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="/forum">Forum</a> <span aria-hidden="true">/</span>
      <a href="/forum/c/${esc(t.category_slug)}">${esc(t.category_name)}</a>
      <span aria-hidden="true">/</span> <span>${esc(t.title)}</span>
    </nav>
    <div class="page-head">
      <div>
        <h1 class="section-title thread-heading">
          ${t.pinned ? '<span class="tag tag-pin">PINNED</span>' : ""}
          ${t.locked ? '<span class="tag tag-lock">LOCKED</span>' : ""}
          ${esc(t.title)}
        </h1>
        <p class="muted">Started by ${esc(t.username)} \xB7 ${esc(timeAgo(t.created_at))} \xB7 ${esc(t.views)} views</p>
      </div>
      ${adminActions}
    </div>
    <div class="post-list">${postList}</div>
    ${pagination(current, pages, (p) => `/forum/t/${t.id}?page=${p}`, "Post pages")}
    ${replyArea}
  </div>
</div>`;
      return page(ctx, { title: t.title, body });
    }
    function newThread(ctx, { categories, errors = [], values = {} }) {
      const body = `
<div class="section forum-page">
  <div class="container narrow">
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="/forum">Forum</a> <span aria-hidden="true">/</span> <span>New thread</span>
    </nav>
    <h1 class="section-title">Start a new thread</h1>
    ${errorList(errors)}
    <form method="post" action="/forum/new" class="stack">
      <input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">
      <label><span>Category</span>
        <select name="category" required>
          ${map(categories, (c) => `<option value="${esc(c.slug)}" ${values.category === c.slug ? "selected" : ""}>${esc(c.name)}</option>`)}
        </select></label>
      <label><span>Title</span>
        <input type="text" name="title" required minlength="3" maxlength="120"
               placeholder="Be specific \u2014 good titles get better answers"
               value="${esc(values.title || "")}"></label>
      <label><span>Body</span>
        <textarea name="body" rows="10" required maxlength="10000"
                  placeholder="Details, settings, clips, logs\u2026">${esc(values.body || "")}</textarea></label>
      <button class="btn btn-primary" type="submit">Create thread</button>
    </form>
  </div>
</div>`;
      return page(ctx, { title: "New thread", body });
    }
    module.exports = { index, category, thread, newThread };
  }
});

// src/routes/forum.js
var require_forum2 = __commonJS({
  "src/routes/forum.js"(exports, module) {
    "use strict";
    var views = require_forum();
    var site = require_site();
    var limits = require_limits();
    var { requireAuth, formBody, setFlash, clientIp } = require_middleware();
    var { tooMany } = require_main();
    var THREADS_PER_PAGE = 20;
    var POSTS_PER_PAGE = 20;
    var MAX_TITLE = 120;
    var MAX_BODY = 1e4;
    function notFound(c) {
      return c.html(site.errorPage(c.get("view"), {
        code: 404,
        title: "Not found",
        message: "This page does not exist."
      }), 404);
    }
    function intParam(value, fallback = 1) {
      const n = parseInt(value, 10);
      return Number.isInteger(n) ? n : fallback;
    }
    function register(app) {
      app.get("/forum", async (c) => {
        const db = c.get("db");
        const categories = await db.all(
          `SELECT c.*,
          (SELECT COUNT(*) FROM threads t WHERE t.category_id = c.id) AS thread_count,
          (SELECT COUNT(*) FROM posts p JOIN threads t ON t.id = p.thread_id WHERE t.category_id = c.id) AS post_count,
          (SELECT t.title FROM threads t WHERE t.category_id = c.id ORDER BY t.updated_at DESC LIMIT 1) AS latest_title,
          (SELECT t.id FROM threads t WHERE t.category_id = c.id ORDER BY t.updated_at DESC LIMIT 1) AS latest_id,
          (SELECT t.updated_at FROM threads t WHERE t.category_id = c.id ORDER BY t.updated_at DESC LIMIT 1) AS latest_at
       FROM categories c ORDER BY c.position, c.id`
        );
        const recent = await db.all(
          `SELECT t.id, t.title, t.updated_at, u.username, c.name AS category,
          (SELECT COUNT(*) FROM posts p WHERE p.thread_id = t.id) AS replies
       FROM threads t JOIN users u ON u.id = t.user_id JOIN categories c ON c.id = t.category_id
       ORDER BY t.updated_at DESC LIMIT 8`
        );
        return c.html(views.index(c.get("view"), { categories, recent }));
      });
      app.get("/forum/c/:slug", async (c) => {
        const db = c.get("db");
        const category = await db.get("SELECT * FROM categories WHERE slug = ?", c.req.param("slug"));
        if (!category) return notFound(c);
        const url = new URL(c.req.url);
        const total = Number((await db.get("SELECT COUNT(*) AS n FROM threads WHERE category_id = ?", category.id)).n);
        const pages = Math.max(1, Math.ceil(total / THREADS_PER_PAGE));
        const page = Math.max(1, Math.min(pages, intParam(url.searchParams.get("page"))));
        const threads = await db.all(
          `SELECT t.*, u.username,
          (SELECT COUNT(*) - 1 FROM posts p WHERE p.thread_id = t.id) AS replies,
          (SELECT MAX(p.created_at) FROM posts p WHERE p.thread_id = t.id) AS last_post_at
       FROM threads t JOIN users u ON u.id = t.user_id
       WHERE t.category_id = ?
       ORDER BY t.pinned DESC, t.updated_at DESC
       LIMIT ? OFFSET ?`,
          category.id,
          THREADS_PER_PAGE,
          (page - 1) * THREADS_PER_PAGE
        );
        return c.html(views.category(c.get("view"), { category, threads, page, pages }));
      });
      app.get("/forum/new", async (c) => {
        const gate = requireAuth(c);
        if (gate) return gate;
        const categories = await c.get("db").all("SELECT * FROM categories ORDER BY position, id");
        const preset = new URL(c.req.url).searchParams.get("c") || "";
        return c.html(views.newThread(c.get("view"), { categories, errors: [], values: { category: preset } }));
      });
      app.post("/forum/new", async (c) => {
        const gate = requireAuth(c);
        if (gate) return gate;
        const db = c.get("db");
        const user = c.get("user");
        const verdict = await limits.check(db, "post", String(user.id), c.get("cfg"));
        if (!verdict.ok) return tooMany(c, verdict.retryAfterSec);
        const categories = await db.all("SELECT * FROM categories ORDER BY position, id");
        const body = await formBody(c);
        const slug = String(body.category || "");
        const title = String(body.title || "").trim().replace(/\s+/g, " ");
        const text = String(body.body || "").trim();
        const category = categories.find((cat) => cat.slug === slug);
        const errors = [];
        if (!category) errors.push("Pick a valid category.");
        if (title.length < 3 || title.length > MAX_TITLE) errors.push(`Title must be 3\u2013${MAX_TITLE} characters.`);
        if (text.length < 1 || text.length > MAX_BODY) errors.push(`Post body must be 1\u2013${MAX_BODY} characters.`);
        if (errors.length > 0) {
          return c.html(views.newThread(c.get("view"), {
            categories,
            errors,
            values: { category: slug, title, body: text }
          }), 400);
        }
        const thread = await db.run(
          "INSERT INTO threads (category_id, user_id, title) VALUES (?, ?, ?)",
          category.id,
          user.id,
          title
        );
        await db.run(
          "INSERT INTO posts (thread_id, user_id, body) VALUES (?, ?, ?)",
          thread.lastInsertRowid,
          user.id,
          text
        );
        setFlash(c, "success", "Thread created.");
        return c.redirect(`/forum/t/${thread.lastInsertRowid}`, 302);
      });
      app.get("/forum/t/:id", async (c) => {
        const db = c.get("db");
        const id = intParam(c.req.param("id"), 0);
        if (id < 1) return notFound(c);
        const thread = await db.get(
          `SELECT t.*, u.username, c.name AS category_name, c.slug AS category_slug
       FROM threads t JOIN users u ON u.id = t.user_id JOIN categories c ON c.id = t.category_id
       WHERE t.id = ?`,
          id
        );
        if (!thread) return notFound(c);
        await db.run("UPDATE threads SET views = views + 1 WHERE id = ?", id);
        const totalPosts = Number((await db.get("SELECT COUNT(*) AS n FROM posts WHERE thread_id = ?", id)).n);
        const pages = Math.max(1, Math.ceil(totalPosts / POSTS_PER_PAGE));
        const page = Math.max(1, Math.min(pages, intParam(new URL(c.req.url).searchParams.get("page"))));
        const posts = await db.all(
          `SELECT p.*, u.username, u.role AS author_role, u.created_at AS author_since,
          (SELECT COUNT(*) FROM posts x WHERE x.user_id = u.id) AS author_posts
       FROM posts p JOIN users u ON u.id = p.user_id
       WHERE p.thread_id = ? ORDER BY p.id LIMIT ? OFFSET ?`,
          id,
          POSTS_PER_PAGE,
          (page - 1) * POSTS_PER_PAGE
        );
        const first = await db.get("SELECT MIN(id) AS m FROM posts WHERE thread_id = ?", id);
        return c.html(views.thread(c.get("view"), {
          thread,
          posts,
          firstPostId: Number(first.m),
          page,
          pages,
          postOffset: (page - 1) * POSTS_PER_PAGE
        }));
      });
      app.post("/forum/t/:id/reply", async (c) => {
        const gate = requireAuth(c);
        if (gate) return gate;
        const db = c.get("db");
        const user = c.get("user");
        const id = intParam(c.req.param("id"), 0);
        if (id < 1) return notFound(c);
        const thread = await db.get("SELECT * FROM threads WHERE id = ?", id);
        if (!thread) return notFound(c);
        if (thread.locked && user.role !== "admin") {
          setFlash(c, "error", "This thread is locked.");
          return c.redirect(`/forum/t/${id}`, 302);
        }
        const verdict = await limits.check(db, "post", String(user.id), c.get("cfg"));
        if (!verdict.ok) return tooMany(c, verdict.retryAfterSec);
        const body = await formBody(c);
        const text = String(body.body || "").trim();
        if (text.length < 1 || text.length > MAX_BODY) {
          setFlash(c, "error", `Reply must be 1\u2013${MAX_BODY} characters.`);
          return c.redirect(`/forum/t/${id}`, 302);
        }
        const post = await db.run(
          "INSERT INTO posts (thread_id, user_id, body) VALUES (?, ?, ?)",
          id,
          user.id,
          text
        );
        await db.run("UPDATE threads SET updated_at = datetime('now') WHERE id = ?", id);
        const total = Number((await db.get("SELECT COUNT(*) AS n FROM posts WHERE thread_id = ?", id)).n);
        const lastPage = Math.max(1, Math.ceil(total / POSTS_PER_PAGE));
        const query = lastPage > 1 ? `?page=${lastPage}` : "";
        return c.redirect(`/forum/t/${id}${query}#post-${post.lastInsertRowid}`, 302);
      });
    }
    module.exports = { register };
  }
});

// src/views/admin.js
var require_admin = __commonJS({
  "src/views/admin.js"(exports, module) {
    "use strict";
    var { page } = require_layout();
    var { esc, timeAgo, map, pagination } = require_util();
    function head(ctx, heading) {
      const tab = (href, label, active) => `<a href="${href}" class="${active ? "active" : ""}">${label}</a>`;
      const p = ctx.path;
      return `<div class="page-head">
    <div><p class="section-kicker">// ADMIN BACKEND</p><h1 class="section-title">${esc(heading)}</h1></div>
  </div>
  <nav class="admin-tabs" aria-label="Admin sections">
    ${tab("/admin", "Dashboard", p === "/admin")}
    ${tab("/admin/users", "Users", p.startsWith("/admin/users"))}
    ${tab("/admin/logs", "IP logs", p.startsWith("/admin/logs"))}
    ${tab("/admin/forum", "Forum", p.startsWith("/admin/forum"))}
  </nav>`;
    }
    var logRow = (l) => `<tr>
  <td><span class="tag tag-event tag-${esc(l.event)}">${esc(l.event)}</span></td>
  <td>${esc(l.username || "\u2014")}</td>
  <td class="mono">${esc(l.ip)}</td>
  <td class="muted">${esc(timeAgo(l.created_at))}</td></tr>`;
    function dashboard(ctx, { stats, recentLogs, recentUsers }) {
      const card = (value, label, warn = false) => `<div class="stat-card ${warn ? "stat-card-warn" : ""}"><span class="stat-card-value">${esc(value)}</span><span class="stat-card-label">${esc(label)}</span></div>`;
      const body = `
<div class="section admin-page">
  <div class="container">
    ${head(ctx, "Dashboard")}
    <div class="stat-cards">
      ${card(stats.users, "Users")}
      ${card(stats.sessions, "Active sessions")}
      ${card(stats.threads, "Threads")}
      ${card(stats.posts, "Posts")}
      ${card(stats.downloads, "Downloads")}
      ${card(stats.signups24h, "Signups (24h)")}
      ${card(stats.failedLogins24h, "Failed logins (24h)", stats.failedLogins24h > 20)}
      ${card(stats.banned, "Banned users", stats.banned > 0)}
    </div>
    <div class="admin-columns">
      <div class="panel">
        <div class="panel-head"><h2>Latest activity</h2><a class="muted" href="/admin/logs">All logs \u2192</a></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Event</th><th>User</th><th>IP</th><th>When</th></tr></thead>
          <tbody>${map(recentLogs, logRow)}</tbody></table></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Newest users</h2><a class="muted" href="/admin/users">All users \u2192</a></div>
        <div class="table-wrap"><table>
          <thead><tr><th>User</th><th>Signup IP</th><th>Joined</th></tr></thead>
          <tbody>${map(recentUsers, (u) => `<tr>
            <td>${esc(u.username)}
              ${u.role === "admin" ? '<span class="tag tag-admin">ADMIN</span>' : ""}
              ${u.banned ? '<span class="tag tag-banned">BANNED</span>' : ""}</td>
            <td class="mono">${esc(u.signup_ip || "\u2014")}</td>
            <td class="muted">${esc(timeAgo(u.created_at))}</td></tr>`)}
          </tbody></table></div>
      </div>
    </div>
  </div>
</div>`;
      return page(ctx, { title: "Admin \xB7 Dashboard", body });
    }
    function users(ctx, { users: rows, q, page: current, pages, total }) {
      const csrf = `<input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">`;
      const actions = (u) => {
        if (u.id === ctx.user.id) return '<span class="muted">you</span>';
        const banBtn = u.banned ? `<form method="post" action="/admin/users/${esc(u.id)}/unban" class="inline-form">${csrf}<button class="btn btn-ghost btn-xs" type="submit">Unban</button></form>` : `<form method="post" action="/admin/users/${esc(u.id)}/ban" class="inline-form" data-confirm="Ban ${esc(u.username)}? They will be signed out everywhere.">${csrf}<button class="btn btn-warn btn-xs" type="submit">Ban</button></form>`;
        const roleLabel = u.role === "admin" ? "Demote" : "Promote";
        const roleConfirm = u.role === "admin" ? `Remove admin rights from ${u.username}?` : `Make ${u.username} an admin?`;
        return `${banBtn}
      <form method="post" action="/admin/users/${esc(u.id)}/role" class="inline-form" data-confirm="${esc(roleConfirm)}">${csrf}
        <button class="btn btn-ghost btn-xs" type="submit">${roleLabel}</button></form>
      <form method="post" action="/admin/users/${esc(u.id)}/delete" class="inline-form"
            data-confirm="Permanently delete ${esc(u.username)}? Their threads and posts stay on the forum, reattributed to [deleted].">${csrf}
        <button class="btn btn-danger btn-xs" type="submit">Delete</button></form>`;
      };
      const body = `
<div class="section admin-page">
  <div class="container">
    ${head(ctx, "Users")}
    <form method="get" action="/admin/users" class="filter-bar">
      <input type="search" name="q" value="${esc(q)}" aria-label="Search users by username, email or IP"
             placeholder="Search username, email or IP\u2026">
      <button class="btn btn-outline" type="submit">Search</button>
      ${q ? '<a class="btn btn-ghost" href="/admin/users">Clear</a>' : ""}
      <span class="muted">${esc(total)} user${total === 1 ? "" : "s"}</span>
    </form>
    <div class="panel"><div class="table-wrap"><table>
      <thead><tr><th>User</th><th>Email</th><th>Signup IP</th><th>Last login</th><th>Posts</th><th>Actions</th></tr></thead>
      <tbody>${map(rows, (u) => `<tr class="${u.banned ? "row-banned" : ""}">
        <td><strong>${esc(u.username)}</strong>
          ${u.role === "admin" ? '<span class="tag tag-admin">ADMIN</span>' : ""}
          ${u.banned ? '<span class="tag tag-banned">BANNED</span>' : ""}
          <div class="muted">#${esc(u.id)} \xB7 joined ${esc(timeAgo(u.created_at))}</div></td>
        <td>${esc(u.email)}</td>
        <td class="mono">${esc(u.signup_ip || "\u2014")}</td>
        <td><span class="mono">${esc(u.last_login_ip || "\u2014")}</span><div class="muted">${esc(timeAgo(u.last_login_at))}</div></td>
        <td>${esc(u.post_count)}</td>
        <td class="actions-cell">${actions(u)}</td></tr>`)}
      </tbody></table></div></div>
    ${pagination(current, pages, (p) => `/admin/users?page=${p}&q=${encodeURIComponent(q)}`)}
  </div>
</div>`;
      return page(ctx, { title: "Admin \xB7 Users", body });
    }
    function logs(ctx, { logs: rows, q, event, events, page: current, pages, total }) {
      const body = `
<div class="section admin-page">
  <div class="container">
    ${head(ctx, "IP logs")}
    <form method="get" action="/admin/logs" class="filter-bar">
      <select name="event" aria-label="Filter by event type">
        <option value="">All events</option>
        ${map(events, (e) => `<option value="${esc(e)}" ${event === e ? "selected" : ""}>${esc(e)}</option>`)}
      </select>
      <input type="search" name="q" value="${esc(q)}" aria-label="Filter logs by IP, username or detail"
             placeholder="Filter by IP, username or detail\u2026">
      <button class="btn btn-outline" type="submit">Filter</button>
      ${q || event ? '<a class="btn btn-ghost" href="/admin/logs">Clear</a>' : ""}
      <span class="muted">${esc(total)} entr${total === 1 ? "y" : "ies"}</span>
    </form>
    <div class="panel"><div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Event</th><th>User</th><th>IP address</th><th>Detail</th><th>User agent</th><th>When</th></tr></thead>
      <tbody>${rows.length === 0 ? '<tr><td colspan="7" class="muted center">No log entries match.</td></tr>' : map(rows, (l) => `<tr>
            <td class="muted">${esc(l.id)}</td>
            <td><span class="tag tag-event tag-${esc(l.event)}">${esc(l.event)}</span></td>
            <td>${esc(l.username || "\u2014")}</td>
            <td class="mono"><a href="/admin/logs?q=${encodeURIComponent(l.ip)}">${esc(l.ip)}</a></td>
            <td class="muted detail-cell">${esc(l.detail || "\u2014")}</td>
            <td class="muted ua-cell" title="${esc(l.user_agent || "")}">${esc(String(l.user_agent || "\u2014").slice(0, 60))}</td>
            <td class="muted nowrap">${esc(l.created_at)} UTC</td></tr>`)}
      </tbody></table></div></div>
    ${pagination(current, pages, (p) => `/admin/logs?page=${p}&event=${encodeURIComponent(event)}&q=${encodeURIComponent(q)}`)}
  </div>
</div>`;
      return page(ctx, { title: "Admin \xB7 IP logs", body });
    }
    function forumAdmin(ctx, { categories, threads }) {
      const csrf = `<input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">`;
      const body = `
<div class="section admin-page">
  <div class="container">
    ${head(ctx, "Forum management")}
    <div class="admin-columns">
      <div class="panel">
        <div class="panel-head"><h2>Categories</h2></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Slug</th><th>Threads</th><th></th></tr></thead>
          <tbody>${map(categories, (c) => `<tr>
            <td><strong>${esc(c.name)}</strong><div class="muted">${esc(c.description)}</div></td>
            <td class="mono">${esc(c.slug)}</td>
            <td>${esc(c.thread_count)}</td>
            <td class="actions-cell">
              <form method="post" action="/admin/categories/${esc(c.id)}/delete" class="inline-form"
                    data-confirm="Delete category '${esc(c.name)}' and ALL ${esc(c.thread_count)} of its threads?">${csrf}
                <button class="btn btn-danger btn-xs" type="submit">Delete</button></form></td></tr>`)}
          </tbody></table></div>
        <form method="post" action="/admin/categories" class="stack panel-form">
          <h3>Add category</h3>${csrf}
          <label><span>Name</span><input type="text" name="name" required minlength="2" maxlength="50"></label>
          <label><span>Description</span><input type="text" name="description" maxlength="300"></label>
          <button class="btn btn-primary btn-sm" type="submit">Create</button>
        </form>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Latest threads</h2></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Thread</th><th>Posts</th><th>Actions</th></tr></thead>
          <tbody>${map(threads, (t) => `<tr>
            <td><a href="/forum/t/${esc(t.id)}">${esc(t.title)}</a>
              ${t.pinned ? '<span class="tag tag-pin">PIN</span>' : ""}
              ${t.locked ? '<span class="tag tag-lock">LOCK</span>' : ""}
              <div class="muted">${esc(t.category_name)} \xB7 ${esc(t.username)} \xB7 ${esc(timeAgo(t.updated_at))}</div></td>
            <td>${esc(t.post_count)}</td>
            <td class="actions-cell">
              <form method="post" action="/admin/threads/${esc(t.id)}/pin" class="inline-form">${csrf}
                <button class="btn btn-ghost btn-xs" type="submit">${t.pinned ? "Unpin" : "Pin"}</button></form>
              <form method="post" action="/admin/threads/${esc(t.id)}/lock" class="inline-form">${csrf}
                <button class="btn btn-ghost btn-xs" type="submit">${t.locked ? "Unlock" : "Lock"}</button></form>
              <form method="post" action="/admin/threads/${esc(t.id)}/delete" class="inline-form"
                    data-confirm="Delete thread '${esc(t.title)}' and all replies?">${csrf}
                <button class="btn btn-danger btn-xs" type="submit">Delete</button></form></td></tr>`)}
          </tbody></table></div>
      </div>
    </div>
  </div>
</div>`;
      return page(ctx, { title: "Admin \xB7 Forum", body });
    }
    module.exports = { dashboard, users, logs, forumAdmin };
  }
});

// src/routes/admin.js
var require_admin2 = __commonJS({
  "src/routes/admin.js"(exports, module) {
    "use strict";
    var views = require_admin();
    var site = require_site();
    var { DELETED_USERNAME, deletedUserId } = require_bootstrap();
    var {
      requireAdmin,
      destroyUserSessions,
      audit,
      formBody,
      setFlash
    } = require_middleware();
    var LOGS_PER_PAGE = 50;
    var USERS_PER_PAGE = 25;
    var LOG_EVENTS = [
      "signup",
      "login",
      "login_failed",
      "login_blocked",
      "logout",
      "download",
      "admin_action",
      "captcha_failed",
      "terms_accepted"
    ];
    function intParam(value, fallback = 1) {
      const n = parseInt(value, 10);
      return Number.isInteger(n) ? n : fallback;
    }
    function backTo(c, fallback) {
      try {
        const url = new URL(c.req.header("referer") || "", "http://local");
        if (url.pathname.startsWith("/admin")) return url.pathname + url.search;
      } catch {
      }
      return fallback;
    }
    var adminAudit = (c, detail) => audit(c, "admin_action", {
      userId: c.get("user").id,
      username: c.get("user").username,
      detail
    });
    function notFound(c, message = "This page does not exist.") {
      return c.html(site.errorPage(c.get("view"), { code: 404, title: "Not found", message }), 404);
    }
    async function findUser(c) {
      const id = intParam(c.req.param("id"), 0);
      if (id < 1) return null;
      return c.get("db").get("SELECT * FROM users WHERE id = ?", id);
    }
    function register(app) {
      app.use("/admin/*", async (c, next) => {
        const gate = requireAdmin(c);
        if (gate) return gate;
        await next();
      });
      app.use("/admin", async (c, next) => {
        const gate = requireAdmin(c);
        if (gate) return gate;
        await next();
      });
      app.get("/admin", async (c) => {
        const db = c.get("db");
        const one = async (sql, ...args) => Number((await db.get(sql, ...args))?.n || 0);
        const stats = {
          users: await one("SELECT COUNT(*) AS n FROM users WHERE username != ?", DELETED_USERNAME),
          banned: await one("SELECT COUNT(*) AS n FROM users WHERE banned = 1 AND username != ?", DELETED_USERNAME),
          threads: await one("SELECT COUNT(*) AS n FROM threads"),
          posts: await one("SELECT COUNT(*) AS n FROM posts"),
          downloads: await one("SELECT COUNT(*) AS n FROM ip_logs WHERE event = 'download'"),
          sessions: await one("SELECT COUNT(*) AS n FROM sessions WHERE expires_at > datetime('now')"),
          signups24h: await one("SELECT COUNT(*) AS n FROM ip_logs WHERE event = 'signup' AND created_at > datetime('now', '-1 day')"),
          failedLogins24h: await one("SELECT COUNT(*) AS n FROM ip_logs WHERE event = 'login_failed' AND created_at > datetime('now', '-1 day')")
        };
        const recentLogs = await db.all("SELECT * FROM ip_logs ORDER BY id DESC LIMIT 12");
        const recentUsers = await db.all(
          "SELECT id, username, role, banned, signup_ip, created_at FROM users WHERE username != ? ORDER BY id DESC LIMIT 8",
          DELETED_USERNAME
        );
        return c.html(views.dashboard(c.get("view"), { stats, recentLogs, recentUsers }));
      });
      app.get("/admin/users", async (c) => {
        const db = c.get("db");
        const url = new URL(c.req.url);
        const q = String(url.searchParams.get("q") || "").trim().slice(0, 100);
        const clauses = ["username != ?"];
        const params = [DELETED_USERNAME];
        if (q) {
          clauses.push("(username LIKE ? OR email LIKE ? OR signup_ip LIKE ? OR last_login_ip LIKE ?)");
          params.push(...Array(4).fill(`%${q}%`));
        }
        const where = `WHERE ${clauses.join(" AND ")}`;
        const total = Number((await db.get(`SELECT COUNT(*) AS n FROM users ${where}`, ...params)).n);
        const pages = Math.max(1, Math.ceil(total / USERS_PER_PAGE));
        const page = Math.max(1, Math.min(pages, intParam(url.searchParams.get("page"))));
        const users = await db.all(
          `SELECT id, username, email, role, banned, signup_ip, last_login_ip, last_login_at, created_at,
          (SELECT COUNT(*) FROM posts p WHERE p.user_id = users.id) AS post_count
       FROM users ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
          ...params,
          USERS_PER_PAGE,
          (page - 1) * USERS_PER_PAGE
        );
        return c.html(views.users(c.get("view"), { users, q, page, pages, total }));
      });
      app.post("/admin/users/:id/ban", async (c) => {
        const db = c.get("db");
        const user = await findUser(c);
        if (!user) return notFound(c, "No such user.");
        if (user.id === c.get("user").id) {
          setFlash(c, "error", "You cannot ban yourself.");
          return c.redirect(backTo(c, "/admin/users"), 302);
        }
        await db.run("UPDATE users SET banned = 1 WHERE id = ?", user.id);
        await destroyUserSessions(db, user.id);
        await adminAudit(c, `banned user #${user.id} (${user.username})`);
        setFlash(c, "success", `${user.username} has been banned and signed out everywhere.`);
        return c.redirect(backTo(c, "/admin/users"), 302);
      });
      app.post("/admin/users/:id/unban", async (c) => {
        const user = await findUser(c);
        if (!user) return notFound(c, "No such user.");
        await c.get("db").run("UPDATE users SET banned = 0 WHERE id = ?", user.id);
        await adminAudit(c, `unbanned user #${user.id} (${user.username})`);
        setFlash(c, "success", `${user.username} has been unbanned.`);
        return c.redirect(backTo(c, "/admin/users"), 302);
      });
      app.post("/admin/users/:id/role", async (c) => {
        const db = c.get("db");
        const user = await findUser(c);
        if (!user) return notFound(c, "No such user.");
        if (user.id === c.get("user").id) {
          setFlash(c, "error", "You cannot change your own role.");
          return c.redirect(backTo(c, "/admin/users"), 302);
        }
        const newRole = user.role === "admin" ? "user" : "admin";
        await db.run("UPDATE users SET role = ? WHERE id = ?", newRole, user.id);
        await destroyUserSessions(db, user.id);
        await adminAudit(c, `set role of #${user.id} (${user.username}) to ${newRole}`);
        setFlash(c, "success", `${user.username} is now ${newRole === "admin" ? "an admin" : "a regular user"}.`);
        return c.redirect(backTo(c, "/admin/users"), 302);
      });
      app.post("/admin/users/:id/delete", async (c) => {
        const db = c.get("db");
        const user = await findUser(c);
        if (!user) return notFound(c, "No such user.");
        if (user.id === c.get("user").id) {
          setFlash(c, "error", "You cannot delete yourself.");
          return c.redirect(backTo(c, "/admin/users"), 302);
        }
        if (user.username === DELETED_USERNAME) {
          setFlash(c, "error", "That is the reserved placeholder account and cannot be deleted.");
          return c.redirect(backTo(c, "/admin/users"), 302);
        }
        const placeholder = await deletedUserId(db);
        const threads = await db.run("UPDATE threads SET user_id = ? WHERE user_id = ?", placeholder, user.id);
        const posts = await db.run("UPDATE posts SET user_id = ? WHERE user_id = ?", placeholder, user.id);
        await db.run("DELETE FROM users WHERE id = ?", user.id);
        await adminAudit(c, `deleted user #${user.id} (${user.username}); reassigned ${threads.changes} threads and ${posts.changes} posts to ${DELETED_USERNAME}`);
        setFlash(c, "success", `${user.username} has been deleted. Their posts remain, attributed to ${DELETED_USERNAME}.`);
        return c.redirect(backTo(c, "/admin/users"), 302);
      });
      app.get("/admin/logs", async (c) => {
        const db = c.get("db");
        const url = new URL(c.req.url);
        const rawEvent = url.searchParams.get("event") || "";
        const event = LOG_EVENTS.includes(rawEvent) ? rawEvent : "";
        const q = String(url.searchParams.get("q") || "").trim().slice(0, 100);
        const clauses = [];
        const params = [];
        if (event) {
          clauses.push("event = ?");
          params.push(event);
        }
        if (q) {
          clauses.push("(ip LIKE ? OR username LIKE ? OR detail LIKE ?)");
          params.push(`%${q}%`, `%${q}%`, `%${q}%`);
        }
        const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
        const total = Number((await db.get(`SELECT COUNT(*) AS n FROM ip_logs ${where}`, ...params)).n);
        const pages = Math.max(1, Math.ceil(total / LOGS_PER_PAGE));
        const page = Math.max(1, Math.min(pages, intParam(url.searchParams.get("page"))));
        const logs = await db.all(
          `SELECT * FROM ip_logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
          ...params,
          LOGS_PER_PAGE,
          (page - 1) * LOGS_PER_PAGE
        );
        return c.html(views.logs(c.get("view"), { logs, q, event, events: LOG_EVENTS, page, pages, total }));
      });
      app.get("/admin/forum", async (c) => {
        const db = c.get("db");
        const categories = await db.all(
          `SELECT c.*, (SELECT COUNT(*) FROM threads t WHERE t.category_id = c.id) AS thread_count
       FROM categories c ORDER BY c.position, c.id`
        );
        const threads = await db.all(
          `SELECT t.*, u.username, c.name AS category_name,
          (SELECT COUNT(*) FROM posts p WHERE p.thread_id = t.id) AS post_count
       FROM threads t JOIN users u ON u.id = t.user_id JOIN categories c ON c.id = t.category_id
       ORDER BY t.updated_at DESC LIMIT 50`
        );
        return c.html(views.forumAdmin(c.get("view"), { categories, threads }));
      });
      app.post("/admin/categories", async (c) => {
        const db = c.get("db");
        const body = await formBody(c);
        const name = String(body.name || "").trim().replace(/\s+/g, " ");
        const description = String(body.description || "").trim().slice(0, 300);
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
        if (name.length < 2 || name.length > 50 || !slug) {
          setFlash(c, "error", "Category name must be 2\u201350 characters.");
          return c.redirect("/admin/forum", 302);
        }
        if (await db.get("SELECT id FROM categories WHERE slug = ?", slug)) {
          setFlash(c, "error", "A category with that name already exists.");
          return c.redirect("/admin/forum", 302);
        }
        const max = (await db.get("SELECT COALESCE(MAX(position), -1) AS m FROM categories")).m;
        await db.run(
          "INSERT INTO categories (name, slug, description, position) VALUES (?, ?, ?, ?)",
          name,
          slug,
          description,
          Number(max) + 1
        );
        await adminAudit(c, `created category "${name}"`);
        setFlash(c, "success", `Category "${name}" created.`);
        return c.redirect("/admin/forum", 302);
      });
      app.post("/admin/categories/:id/delete", async (c) => {
        const db = c.get("db");
        const id = intParam(c.req.param("id"), 0);
        const category = id > 0 ? await db.get("SELECT * FROM categories WHERE id = ?", id) : null;
        if (!category) {
          setFlash(c, "error", "No such category.");
          return c.redirect("/admin/forum", 302);
        }
        await db.run("DELETE FROM categories WHERE id = ?", id);
        await adminAudit(c, `deleted category "${category.name}" and its threads`);
        setFlash(c, "success", `Category "${category.name}" deleted.`);
        return c.redirect("/admin/forum", 302);
      });
      const findThread = async (c) => {
        const id = intParam(c.req.param("id"), 0);
        return id > 0 ? c.get("db").get("SELECT * FROM threads WHERE id = ?", id) : null;
      };
      app.post("/admin/threads/:id/pin", async (c) => {
        const thread = await findThread(c);
        if (!thread) return notFound(c, "No such thread.");
        await c.get("db").run("UPDATE threads SET pinned = 1 - pinned WHERE id = ?", thread.id);
        await adminAudit(c, `${thread.pinned ? "unpinned" : "pinned"} thread #${thread.id}`);
        return c.redirect(backTo(c, `/forum/t/${thread.id}`), 302);
      });
      app.post("/admin/threads/:id/lock", async (c) => {
        const thread = await findThread(c);
        if (!thread) return notFound(c, "No such thread.");
        await c.get("db").run("UPDATE threads SET locked = 1 - locked WHERE id = ?", thread.id);
        await adminAudit(c, `${thread.locked ? "unlocked" : "locked"} thread #${thread.id}`);
        return c.redirect(backTo(c, `/forum/t/${thread.id}`), 302);
      });
      app.post("/admin/threads/:id/delete", async (c) => {
        const thread = await findThread(c);
        if (!thread) return notFound(c, "No such thread.");
        await c.get("db").run("DELETE FROM threads WHERE id = ?", thread.id);
        await adminAudit(c, `deleted thread #${thread.id} ("${String(thread.title).slice(0, 60)}")`);
        setFlash(c, "success", "Thread deleted.");
        return c.redirect("/admin/forum", 302);
      });
      app.post("/admin/posts/:id/delete", async (c) => {
        const db = c.get("db");
        const id = intParam(c.req.param("id"), 0);
        const post = id > 0 ? await db.get("SELECT * FROM posts WHERE id = ?", id) : null;
        if (!post) {
          setFlash(c, "error", "No such post.");
          return c.redirect(backTo(c, "/admin/forum"), 302);
        }
        const first = await db.get("SELECT MIN(id) AS m FROM posts WHERE thread_id = ?", post.thread_id);
        if (Number(first.m) === post.id) {
          setFlash(c, "error", "That is the opening post \u2014 delete the whole thread instead.");
          return c.redirect(backTo(c, `/forum/t/${post.thread_id}`), 302);
        }
        await db.run("DELETE FROM posts WHERE id = ?", id);
        await adminAudit(c, `deleted post #${id} in thread #${post.thread_id}`);
        setFlash(c, "success", "Post deleted.");
        return c.redirect(backTo(c, `/forum/t/${post.thread_id}`), 302);
      });
    }
    module.exports = { register, LOG_EVENTS };
  }
});

// src/app.js
var require_app = __commonJS({
  "src/app.js"(exports, module) {
    "use strict";
    var { Hono: Hono2 } = require_cjs();
    var { bodyLimit } = require_body_limit();
    var {
      securityHeaders,
      loadContext,
      csrfProtection,
      termsGate
    } = require_middleware();
    var { errorPage } = require_site();
    var { createCompany } = require_company();
    var mainRoutes = require_main();
    var authRoutes = require_auth2();
    var forumRoutes = require_forum2();
    var adminRoutes = require_admin2();
    var APP_VERSION = "1.0.0";
    function fallbackView() {
      return {
        user: null,
        path: "/",
        flash: null,
        csrfToken: "",
        needsTermsGate: false,
        termsVersion: "",
        company: createCompany({}),
        appName: "GoyHub",
        appVersion: APP_VERSION
      };
    }
    function createApp2({ resolveDb, staticMiddleware, env = {} } = {}) {
      const app = new Hono2();
      app.use("*", securityHeaders);
      if (staticMiddleware) app.use("*", staticMiddleware);
      app.use("*", bodyLimit({
        maxSize: 256 * 1024,
        onError: (c) => c.html(errorPage(c.get("view") || fallbackView(), {
          code: 413,
          title: "Request failed",
          message: "Request too large. Trim it down and try again."
        }), 413)
      }));
      app.use("*", async (c, next) => {
        c.set("appVersion", APP_VERSION);
        const cfg = typeof env === "function" ? env(c) : env;
        c.set("cfg", cfg);
        c.set("company", createCompany(cfg));
        c.set("db", await resolveDb(c));
        await next();
      });
      app.use("*", loadContext);
      app.use("*", csrfProtection);
      app.use("*", termsGate);
      mainRoutes.register(app);
      authRoutes.register(app);
      forumRoutes.register(app);
      adminRoutes.register(app);
      app.notFound((c) => c.html(errorPage(c.get("view") || fallbackView(), {
        code: 404,
        title: "Not found",
        message: "This page does not exist."
      }), 404));
      app.onError((err, c) => {
        const status = Number(err && (err.status || err.statusCode));
        const code = status >= 400 && status < 600 ? status : 500;
        if (code >= 500) console.error("Unhandled error:", err);
        const messages = {
          400: "That request could not be understood. Go back and try again.",
          413: "Request too large. Trim it down and try again."
        };
        try {
          return c.html(errorPage(c.get("view") || fallbackView(), {
            code,
            title: code >= 500 ? "Server error" : "Request failed",
            message: messages[code] || (code >= 500 ? "Something went wrong on our side. Try again in a moment." : "The request could not be completed.")
          }), code);
        } catch {
          return c.text(`${code} \u2014 request failed`, code);
        }
      });
      return app;
    }
    module.exports = { createApp: createApp2, APP_VERSION };
  }
});

// src/db/d1-adapter.js
var require_d1_adapter = __commonJS({
  "src/db/d1-adapter.js"(exports, module) {
    "use strict";
    function createD1Adapter2(d1) {
      const bind = (sql, params) => params.length ? d1.prepare(sql).bind(...params) : d1.prepare(sql);
      return {
        kind: "d1",
        async all(sql, ...params) {
          const { results } = await bind(sql, params).all();
          return results || [];
        },
        async get(sql, ...params) {
          const row = await bind(sql, params).first();
          return row === null ? void 0 : row;
        },
        async run(sql, ...params) {
          const { meta } = await bind(sql, params).run();
          return {
            lastInsertRowid: Number(meta?.last_row_id ?? 0),
            changes: Number(meta?.changes ?? 0)
          };
        },
        /**
         * D1 rejects multi-statement exec, so strip full-line comments and split on
         * semicolons. Safe only because the DDL contains no semicolons inside string
         * literals — keep it that way if you extend schema.sql.
         */
        async exec(sql) {
          const statements = sql.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n").split(";").map((s) => s.trim()).filter(Boolean);
          for (const statement of statements) {
            await d1.prepare(statement).run();
          }
        }
      };
    }
    module.exports = { createD1Adapter: createD1Adapter2 };
  }
});

// src/pages-entry.js
var import_app = __toESM(require_app());
var import_d1_adapter = __toESM(require_d1_adapter());
var import_bootstrap = __toESM(require_bootstrap());
var appInstance = null;
var bootstrapped = null;
async function onRequest(context) {
  const { request, env } = context;
  globalThis.PBKDF2_ITERATIONS_OVERRIDE = env.PBKDF2_ITERATIONS;
  if (!bootstrapped) {
    bootstrapped = (0, import_bootstrap.seed)((0, import_d1_adapter.createD1Adapter)(env.DB), env).catch((err) => {
      bootstrapped = null;
      throw err;
    });
  }
  await bootstrapped;
  if (!appInstance) {
    appInstance = (0, import_app.createApp)({
      env,
      resolveDb: (c) => (0, import_d1_adapter.createD1Adapter)(c.env.DB)
    });
  }
  return appInstance.fetch(request, env, context);
}
export {
  onRequest
};
