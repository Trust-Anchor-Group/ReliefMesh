import test from 'node:test';
import assert from 'node:assert/strict';
import {neuroChildEnvironment} from '../src/actor.js';
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
test('Neuro child receives its database salt without inheriting server credentials',()=>{
  const environment=neuroChildEnvironment({FILES_DB_SALT:'stable-salt',OPENAI_API_KEY:'server-secret',AI_API_KEY:'other-secret',AZURE_TOKEN:'unrelated-secret'});
  assert.equal(environment.FILES_DB_SALT,'stable-salt');
  assert.equal(environment.OPENAI_API_KEY,undefined);
  assert.equal(environment.AI_API_KEY,undefined);
  assert.equal(environment.AZURE_TOKEN,undefined);
  assert.ok(environment.PATH);
});
