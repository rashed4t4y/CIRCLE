import test from 'node:test';
import assert from 'node:assert/strict';
import { textField, imageUrl, username, email, password, id, pagination, likePattern, bodyObject } from '../src/services/validation.js';

test('validation rejects unsafe and malformed input at API boundaries', () => {
  for (const value of [null, [], 'hello', 42]) assert.throws(()=>bodyObject(value));
  assert.throws(()=>textField('   ','content'));
  assert.throws(()=>textField('x'.repeat(501),'content'));
  assert.equal(username(' Maya_123 '),'maya_123');
  assert.throws(()=>username('bad/name'));
  assert.equal(email(' MAYA@Circle.Example '),'maya@circle.example');
  assert.throws(()=>email('bad-email'));
  assert.throws(()=>password('short'));
  assert.throws(()=>password('🔒'.repeat(20)));
  for(const value of ['javascript:alert(1)','data:image/svg+xml,test','https://user:pass@example.com/image.png']) assert.throws(()=>imageUrl(value,'image_url'));
  assert.equal(imageUrl('','avatar_url'),null);
  assert.equal(imageUrl('https://example.com/photo.jpg','image_url'),'https://example.com/photo.jpg');
});

test('IDs, paging, and literal search terms have bounded behavior', () => {
  for(const value of [0,-1,'1 OR 1=1',2147483648,'1.2']) assert.throws(()=>id(value));
  assert.equal(id('12'),12);
  assert.deepEqual(pagination({page:'2',limit:'20'}),{page:2,limit:20,offset:20});
  assert.throws(()=>pagination({limit:'999'}));
  assert.throws(()=>pagination({page:'nope'}));
  assert.equal(likePattern('50%_off'),'%50\\%\\_off%');
});
