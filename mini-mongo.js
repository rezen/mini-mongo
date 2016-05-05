'use strict';

/**
 * Module dependancies
 * @requires
 */
const fs           = require('fs');
const Nedb         = require('nedb');
const EventEmitter = require('eventemitter2').EventEmitter2;
const async        = require('async');

/**
 * MiniMongo is designed to be a file (json) based imitation of mongodb.
 * Most of the heavy lifting is done by the excellent nedb, which
 * imitates mongodb collection functionality. MiniMongo adds a layer on
 * top of nedb, as it acts like the database and treats nedb datastore
 * instances as collections, in attempts to line up with with mongob
 * library
 *
 * @todo scan directory for other collections
 * @notes
 * Don't worry about duplicates in store file. Store is meant to be append only
 * https://github.com/louischatriot/nedb/issues/226
 * https://github.com/louischatriot/nedb#compacting-the-database
 */
class MiniMongo extends EventEmitter{

  constructor(config) {
    super({wildcard: true});
    this.config      = config;
    this.Nedb        = Nedb;
    this.fs          = fs;
    this.collections = {};
    this.directory   = config.directory;
    this.state       = 'cold';
    this.updating    = {};
    this.setupInternal(config.directory);
  }

  /**
   * Sets up the database, loading the internal db
   * and adds tracked collections
   *
   * @param  {Object|Function} config
   * @param  {Function}        callback
   */
  connect(config, callback) {
    if (typeof config === 'function') {
      callback = config;
      config = {};
    }

    const self = this;

    // Find all collections tracked internally
    self.internal.find({}, (err, docs) => {
      if (err) {
        self.emit('error', err);
        return callback(err);
      }

      // Create instance of each collections datastore
      async.each(docs, (doc, done) => {
        self.createCollection(doc.collection, {}, done);
      },

      (err) => {
        if (err) {self.emit('error', err);}

        self.state = 'connected';
        callback(err, this);
      });
    });

    return this;
  }

  /**
   * If database is used as a stub for mongodb
   *
   * @param  {Function} callback
   */
  close(callback) {
    callback(null);
  }

  /**
   * Get the collection of the given name
   *
   * @param  {String} name
   * @return {Nedb}
   */
  collection(name) {
    if (!this.collections[name]) {
      return this.createCollection(name);
    }

    return this.collections[name];
  }

  /**
   * Get each of the collections instances
   *
   * @param  {Function} callback
   */
  collections(callback) {
    callback(null, Object.values(this.collections));
  }

  /**
   * Get the name of each collection
   *
   * @param  {Function} callback
   */
  listCollections(callback) {
    callback(null, Object.keys(this.collections));
  }

  /**
   * Remove the collection from the internal database
   * but keeps the local file
   *
   * @param  {String}   name
   * @param  {Function} callback
   */
  dropCollection(name, callback) {
    this.internal.remove({collection: name}, {}, (err, res) => {
      this.emit('collection.drop', name, err, res);
      callback(err, res);
    });
  }

  /**
   * Get database stats such as number of collections,
   * filesize, number of objects
   *
   * @param  {Function} callback
   */
  stats(callback) {
    const self = this;
    const data = {collections: 0};

    this.listCollections((err, collections) => {
      if (err) {return callback(err);}

      /**
       * Update all the collections meta data and then
       * aggregate that data
       */
      async.each(collections, this.updateMeta.bind(self), () => {
        self.internal.find({}, (err, docs) => {
          if (err) {return callback(err);}

          data.collections = docs.length;
          data.fileSize    = docs.reduce((size, doc) => size + doc.size, 0);
          data.objects     = docs.reduce((count, doc) => count + (doc.objects || 0), 0);
          data.fileSizeMb  = data.fileSize / 1048576;
          callback(err, data);
        });
      });
    });
  }

  /**
   * Return the collection immediately if you need it,
   * or if you want to wait until its completely ready
   * you can pass a callback
   *
   * @param  {String}   name
   * @param  {Object}   options
   * @param  {Function} callback
   * @return {Nedb}
   */
  createCollection(name, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    options = options || {};
    callback = callback || function() {};

    if (this.collections[name]) {
      callback(null, this.collections[name]);
      return this.collections[name];
    }

    const self = this;
    const query = {collection: name};

    self.internal.find(query, (err, docs) => {
      if (err) {self.emit('error', err);}

      // If record already exist ... stop
      if (docs.length > 0) {return;}

      // If collection is already being worked on
      if (this.updating[name]) {return;}

      // Set flag to indicate collection is being processed
      this.updating[name] = true;

      self.internal.insert({
        // Version for the schema
        __v        : 1,
        collection : name,
        added_at   : new Date()
      }, () => {
        self.emit('collection.created', name);
        this.updating[name] = false;
      });
    });

    self.collections[name] = new self.Nedb({
      filename: self.collectionFile(name),
      autoload: true,
      onload  : (err) => {
        self.updateMeta(name);
        callback(err, self.collections[name]);
      }
    });

    return self.collections[name];
  }

  /**
   * Sets up the internal database
   *
   * @private
   * @param  {String} directory
   */
  setupInternal(directory) {
    this.state = 'initializing';
    this.internal = new this.Nedb({
      filename : directory + '/_db.json',
      autoload : true,
      onload   : (err) => {
        if (err) {
          this.emit('error', err);
          this.state = 'error';
        } else {
          this.emit('ready', this.internal);
          this.state = 'ready';
        }
      }
    });

    // @todo investigate more deeply
    // this.internal.persistence.stopAutocompaction();
  }

  /**
   * Update the meta data for a given collection
   *
   * @private
   * @param  {String}   name
   * @param  {Function} callback
   */
  updateMeta(name, callback) {
    callback = callback || function() {};

    const self = this;
    const file = self.collectionFile(name);

    if (this.updating[name]) {
      return callback();
    }

    this.updating[name] = true;

    async.parallel({
      size(callback) {
        self.fs.stat(
          file, (err, stat) =>
          callback(err, stat ? stat.size : 0)
        );
      },

      objects(callback) {
        self.collection(name).find({},
          (err, docs) => callback(err, docs ? docs.length : null)
        );
      }
    }, function(err, data) {
      data.updated_at = new Date();
      data.collection = name;
      const query = {collection: name};
      self.internal.update(query, {$set: data}, {upsert: true}, (err_, res) => {
        self.updating[name] = false;
        callback(err_, res);
      });
    });
  }

  /**
   * What is the file associated with a given collection
   *
   * @param  {String} name
   * @return {String}
   */
  collectionFile(name) {
    return this.directory + '/' + name + '.json';
  }
}

/**
 * @param  {Object}   config
 * @param  {Function} callback
 * @param  {Object}
 */
MiniMongo.connect = function(config, callback, compat) {
  const db = new MiniMongo(config);
  return db.connect({}, callback);
};

module.exports = MiniMongo;
