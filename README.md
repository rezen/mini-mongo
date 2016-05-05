## mini-mongo
[![NPM Version][npm-image]][npm-url] <br />

## About
Think of mini-mongo vs. mongodb as sqlite vs mysql! mini-mongo is built on top of the 
superb npm module `nedb` and adds additional functionality to line up with the mongodb db
interface.

## Install
`npm install mini-mongo`


## Example
```js
'use strict';

const MiniMongo = require('mini-mongo');

MiniMongo.connect({
  autoload: true,
  directory: './data/'
}, (err, db) => {

  const cats  = db.collection('cats');
  const dogs  = db.collection('dogs');
  const dogs2 = db.collection('dogs2');
  const dogs3 = db.collection('dogs3');

  for (let i = 0; i < 10; i++) {
    cats.insert({label: 'Meow-' + i});
  }
  
  setTimeout(() => {
    db.stats((err, stats) => {
      console.log(err, stats);
    });
  }, 100);
});

```

[npm-image]: https://img.shields.io/npm/v/mini-mongo.svg
[npm-url]: https://npmjs.org/package/mini-mongo

