// @ts-check

/**
 * @param {any} object
 * @returns {string}
 */
function serialize(object) {
  // stringify does not handle undefined, errors, or functions
  if (typeof object === 'number') {
    if (Number.isNaN(object)) {
      return JSON.stringify({ type: 'number', value: 'NaN' });
    }
    if (object === Infinity) {
      return JSON.stringify({ type: 'number', value: 'Infinity' });
    }
    if (object === -Infinity) {
      return JSON.stringify({ type: 'number', value: '-Infinity' });
    }
    return JSON.stringify({ type: 'number', value: object });
  }
  
  if (typeof object === 'string') {
    return JSON.stringify({ type: 'string', value: object });
  }
  
  if (typeof object === 'boolean') {
    return JSON.stringify({ type: 'boolean', value: object });
  }
  
  if (typeof object === 'function') {
    return JSON.stringify({ type: 'function', value: object.toString() });
  }

  if (typeof object === 'undefined') {
    return JSON.stringify({ type: 'undefined', value: '' });
  }

  if ( object === null ) {
    return JSON.stringify({ type: 'null', value: '' });
  }

  if (object instanceof Error) {
    const errorObj = {
      name: object.name,           
      message: object.message,     
      cause: 'cause' in object ? object.cause : undefined,
    };
    const serializedObj = JSON.parse(serialize(errorObj));
    return JSON.stringify({ type: 'error', value: serializedObj });
  }

  if (object instanceof Date) {
    return JSON.stringify({ type: 'date', value: object.toISOString() });
  }

  if (Array.isArray(object)) {
    const serializedArray = object.map(item => JSON.parse(serialize(item)));
    return JSON.stringify({ type: 'array', value: serializedArray });
  }

  if (typeof object === 'object') {
    const serializedObj = {};
    for (const key in object) {
      if (object.hasOwnProperty(key)) {
        serializedObj[key] = JSON.parse(serialize(object[key]));
      }
    }
    return JSON.stringify({ type: 'object', value: serializedObj });
  }

  // some default for now
  return JSON.stringify({ type: 'json', value: object });
}


/**
 * @param {string} string
 * @returns {any}
 */
function deserialize(string) {
  if (typeof string !== 'string') {
    throw new Error(`Invalid argument type: ${typeof string}.`);
  }
  
  const parsed = JSON.parse(string);
  
  switch (parsed.type) {
    case 'undefined':
      return undefined;
      
    case 'null':
      return null;
      
    case 'number':
      if (parsed.value === 'NaN') return NaN;
      if (parsed.value === 'Infinity') return Infinity;
      if (parsed.value === '-Infinity') return -Infinity;
      return parsed.value;
      
    case 'string':
      return parsed.value;
      
    case 'boolean':
      return parsed.value;
      
    case 'function':
      return new Function(`return (${parsed.value})`)();
      
    case 'error':
      const err = new Error();
      const errorProps = deserialize(JSON.stringify(parsed.value));
      err.name = errorProps.name;
      err.message = errorProps.message;
      if ('cause' in errorProps) {
        err.cause = errorProps.cause;
      }
      return err;
      
    case 'date':
      return new Date(parsed.value);
      
    case 'array':
      return parsed.value.map(item => deserialize(JSON.stringify(item)));
      
    case 'object':
      const obj = {};
      for (const key in parsed.value) {
        if (parsed.value.hasOwnProperty(key)) {
          obj[key] = deserialize(JSON.stringify(parsed.value[key]));
        }
      }
      return obj;
      
    // handle default case
    case 'json':
      return parsed.value;
    
    // if default case doesn't even work, use real default...
    default:
      throw new Error(`Unknown serialized type: ${parsed.type}.`);
  }
}

module.exports = {
  serialize,
  deserialize,
};
