// @ts-check

/**
 * @param {any} object
 * @returns {string}
 */
function serialize(object) {
  let out = '{"type":';
  if (object === null){
    out += '"null"';
  } else if (object instanceof Date) {
    out += '"date"';
  } else if (object instanceof Error) {
    out += '"error"';
  }
  else {
    out += '"' + typeof object + '"';
  }
  out += ',"value":';
  if (object === undefined) {
    out += "null";
  } else if (object === null) {
    out += "null";
  } else if (typeof object === "string") {
    out += JSON.stringify(object);
  } else if (typeof object === "object") {
    if (Array.isArray(object)) {
      out += "[";
      if (object.length > 0) {
        out += serialize(object[0]);
        for (let i = 1; i < object.length; i++) {
          out += "," + serialize(object[i]);
        }
      }
      out += "]";
    } else if (object instanceof Date) {
      out += '"' + object.toISOString() + '"';
    } else if (object instanceof Error) {
      out += '"' + object.message + '"';
    } else {
      out += "{"
      for (const [key, value] of Object.entries(object)) {
        out += '"' + key + '"' + ":" +  serialize(value) + ",";
      }
      if (Object.keys(object).length > 0) {
        out = out.slice(0, -1);
      }
      out += "}"
    }
  } else {
    out += JSON.stringify(object.toString());
  }
  out += "}";
  return out;
}


/**
 * @param {string} string
 * @returns {any}
 */
function deserialize(string) {
  if (typeof string !== 'string') {
    throw new Error(`Invalid argument type: ${typeof string}.`);
  }

  const json = JSON.parse(string);
  return deserialize_helper(json)
}

function deserialize_helper(object) {
  if (!Object.hasOwn(object, "type")) {
    throw new Error('Invalid JSON: missing key "type"');
  }
  if (!Object.hasOwn(object, "value")) {
    throw new Error('Invalid JSON: missing key "value"');
  }
  switch (object.type) {
    case "undefined": 
      return undefined
    case "null":
      return null
    case "string":
      return object.value;
    case "number":
      return Number(object.value)
    case "boolean":
      if (object.value === "true") {
        return true;
      } else if (object.value === "false") {
        return false;
      } else {
        throw new Error("Invalid boolean value");
      }
    case "function":
      // const parens = object.value.match(/\(([^)]+)\)/)
      // const vars = parens ? parens[1].split(",").map(v => v.trim()) : [];
      // const match = object.value.match(/{([^}]+)}|=>\s*(.*)/)
      // const body = match ? (match[1] || "return " + match[2]) : "";
      
      return new Function("return " + object.value)();
    case "date":
      return new Date(object.value);
    case "error":
      return new Error(object.value);
    case "object": 
      const parsed = object.value;
      if (Array.isArray(parsed)) {
        let out = [];
        parsed.forEach((elt) => out.push(deserialize_helper(elt)));
        return out;
      } else {
        let out = {};
        for (const [key, value] of Object.entries(parsed)) {
          out[key] = deserialize_helper(value)
        }
        return out
      }
    default:
      throw new Error("Unrecognized type");
  }
}

module.exports = {
  serialize,
  deserialize,
};
