// Checks tool arguments against the subset of JSON Schema the tool definitions
// use, and fills in defaults. Messages name the offending argument so a model
// can correct the call.

import { InputError } from './search.js';

function checkValue(name, spec, value) {
  if (spec.type === 'string') {
    if (typeof value !== 'string') throw new InputError(`"${name}" must be a string.`);
    if (spec.maxLength && value.length > spec.maxLength) {
      throw new InputError(`"${name}" must be at most ${spec.maxLength} characters.`);
    }
    if (spec.pattern && !new RegExp(spec.pattern).test(value)) {
      throw new InputError(`"${name}" has the wrong format. ${spec.description}`);
    }
  } else if (spec.type === 'integer') {
    if (!Number.isInteger(value)) throw new InputError(`"${name}" must be an integer.`);
    if (value < spec.minimum || value > spec.maximum) {
      throw new InputError(`"${name}" must be between ${spec.minimum} and ${spec.maximum}.`);
    }
  } else if (spec.type === 'boolean') {
    if (typeof value !== 'boolean') throw new InputError(`"${name}" must be true or false.`);
  } else if (spec.type === 'array') {
    if (!Array.isArray(value)) throw new InputError(`"${name}" must be an array.`);
    for (const item of value) checkValue(`${name}[]`, spec.items, item);
  }
  if (spec.enum && !spec.enum.includes(value)) {
    throw new InputError(`"${name}" must be one of: ${spec.enum.join(', ')}.`);
  }
}

/**
 * @param {{ properties: Record<string, any>, required?: string[] }} schema
 * @param {unknown} args
 * @returns {Record<string, any>} validated arguments with defaults applied
 */
export function validate(schema, args) {
  if (args === undefined || args === null) args = {};
  if (typeof args !== 'object' || Array.isArray(args)) throw new InputError('Arguments must be an object.');
  const out = {};
  for (const [name, value] of Object.entries(args)) {
    const spec = schema.properties[name];
    if (!spec) {
      throw new InputError(`Unknown argument "${name}". Allowed: ${Object.keys(schema.properties).join(', ')}.`);
    }
    if (value === null || value === undefined) continue;
    checkValue(name, spec, value);
    out[name] = value;
  }
  for (const name of schema.required ?? []) {
    if (out[name] === undefined) throw new InputError(`"${name}" is required.`);
  }
  for (const [name, spec] of Object.entries(schema.properties)) {
    if (out[name] === undefined && spec.default !== undefined) out[name] = spec.default;
  }
  return out;
}
