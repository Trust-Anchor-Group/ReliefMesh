import test from 'node:test';
import assert from 'node:assert/strict';
import {neuroResult} from '../src/result.js';
import {validateNetwork} from '../src/messaging.js';

test('Parses Neuro-Ali nested result values without confusing schema metadata',()=>{
  assert.deepEqual(neuroResult({content:[],structuredContent:{result:{type:'object',properties:{Success:true}}}}),{Success:true});
  assert.deepEqual(neuroResult({content:[{type:'text',text:'{"type":"object","properties":{"Success":false}}'}]}),{Success:false});
});
test('Participant addresses must be distinct bare JIDs',()=>{
  assert.equal(validateNetwork({A:'coordinator@example.invalid',B:'volunteer@example.invalid'}),true);
  for(const value of [null,{}, {A:'a@example.invalid',B:'A@example.invalid'}, {A:'a@example.invalid/device',B:'b@example.invalid'}, {A:'a',B:'b'}])assert.equal(validateNetwork(value),false);
});
