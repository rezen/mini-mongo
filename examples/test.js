'use strict';

const MiniMongo = require('../index');

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
