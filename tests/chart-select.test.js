const test = require('node:test');
const assert = require('node:assert');
const {toggle, visible} = require('../chart-select.js');

const series = [{id: 'a'}, {id: 'b'}, {id: 'c'}];
const ids = list => list.map(s => s.id);

test('every line shows until a label is picked', () => {
  assert.deepEqual(ids(visible(series, new Set())), ['a', 'b', 'c']);
});

test('the first label shows only its line, more labels add theirs', () => {
  const one = toggle(new Set(), 'b');
  assert.deepEqual(ids(visible(series, one)), ['b']);
  assert.deepEqual(ids(visible(series, toggle(one, 'a'))), ['a', 'b']);
});

test('clicking a picked label takes it out, and the last one brings every line back', () => {
  const two = toggle(toggle(new Set(), 'a'), 'b');
  assert.deepEqual(ids(visible(series, toggle(two, 'a'))), ['b']);
  assert.deepEqual(ids(visible(series, toggle(toggle(two, 'a'), 'b'))), ['a', 'b', 'c']);
});

test('toggle leaves the set it was given alone', () => {
  const before = new Set(['a']);
  toggle(before, 'b');
  assert.deepEqual([...before], ['a']);
});

test('a picked series no longer in the list shows every line', () => {
  assert.deepEqual(ids(visible(series, new Set(['gone']))), ['a', 'b', 'c']);
});
