'use strict';

describe('MongooseExtension Tests', function () {

    var mockgoose = require('mockgoose');
    var mongoose = require('mongoose');
    mockgoose(mongoose);
    mongoose.createConnection('mongodb://localhost:3001/Whatever');

    var MongooseJob = require('../index').MongooseJob;

    var mongooseJob;
    beforeEach(function (done) {
        mockgoose.reset();
        mongooseJob = new MongooseJob(mongoose);
        done();
    });

    describe('SHOULD', function () {

        it('Be able to instantiate mongoosejob', function (done) {
            expect(mongooseJob).toBeTruthy();
            done();
        });

        it('Be able to create a job', function (done) {
            var oneSecond = new Date(Date.now() + 1);
            mongooseJob.createJob('test-job', {due: oneSecond}, function (err, result) {
                console.log('Created due date', err, result);
                expect(result.due).toBe(oneSecond);
                mongooseJob.Model.find({}, function (err, results) {
                    expect(results.length).toBe(1);
                    done(err);
                });
            });
        });

        describe('Have jobs', function () {
            beforeEach(function (done) {
                var oneSecond = new Date(Date.now() + 100);
                mongooseJob.createJob('test-job2', {due: oneSecond}, function (err, result) {
                    console.log('Created due date', err, result);
                    expect(result.due).toBe(oneSecond);
                    mongooseJob.Model.find({}, function (err, results) {
                        expect(results.length).toBe(1);
                        done(err);
                    });
                });
            });

            it('Only allow one job name ', function (done) {
                var oneSecond = new Date(Date.now() + 1);
                mongooseJob.createJob('test-job2', {due: oneSecond}, function () {
                    mongooseJob.Model.find({}, function (err, results) {
                        expect(results.length).toBe(1);
                        done(err);
                    });
                });
            });

            it('Be able to remove a job', function (done) {
                var spy = jasmine.createSpy('jobHandler');
                mongooseJob.addJobHandler('test-job2', spy);
                mongooseJob.removeJob('test-job2', function (err, result) {
                    expect(result.name).toBe('test-job2');
                    mongooseJob.Model.find({}, function (err, results) {
                        expect(results.length).toBe(0);
                        done(err);
                    });
                    waits(200);
                    runs(function () {
                        expect(spy).not.toHaveBeenCalled();
                    });
                });

            });

            it('Be able to register for a job update', function (done) {
                var spy = jasmine.createSpy('jobHandler');
                mongooseJob.addJobHandler('test-job2', spy);
                waits(200);
                runs(function () {
                    expect(spy).toHaveBeenCalled();
                });
                done();

            });

            describe('Registered for updates', function () {
                beforeEach(function (done) {
                    mockgoose.reset();
                    var oneSecond = new Date(Date.now() + 100);
                    mongooseJob.createJob('test-job3', {due: oneSecond}, function (err) {
                        done(err);
                    });
                });

                it('Be able to unregister for a job update', function (done) {
                    var spy = jasmine.createSpy('jobHandler');
                    mongooseJob.addJobHandler('test-job3', spy);
                    mongooseJob.removeJobHandler('test-job3', spy);
                    waits(200);
                    runs(function () {
                        expect(spy).not.toHaveBeenCalled();
                    });
                    done();
                });
            });
        });

        it('Automatically run jobs on startup', function (done) {
            mockgoose.reset();
            var oneSecond = new Date(Date.now() + 100);
            mongoose.model('mongoosejob').create({ name: 'one', due: oneSecond }, { name: 'two', due: oneSecond }, function (err, jobOne, jobTwo) {

                var jobs = new MongooseJob(mongoose);
                expect(jobOne).toBeDefined();
                expect(jobTwo).toBeDefined();
                var spyOne = jasmine.createSpy('one');
                var spyTwo = jasmine.createSpy('two');
                jobs.addJobHandler('one', spyOne);
                jobs.addJobHandler('two', spyTwo);
                waits(200);
                runs(function () {
                    expect(spyOne).toHaveBeenCalled();
                    expect(spyTwo).toHaveBeenCalled();
                });
                done(err);
            });
        });

        describe('Add a recurring Job', function () {
            it('Call the method over and over until cancelled', function (done) {
                var rule = new mongooseJob.RecurrenceRule();
                rule.second = null;
                mongooseJob.createJob('seconds-repeat', {due: rule});
                var spy = jasmine.createSpy('jobHandler');
                mongooseJob.addJobHandler('seconds-repeat', spy);
                waits(3010);
                runs(function () {
                    expect(spy.callCount).toBe(3);
                    mongooseJob.removeJob('seconds-repeat');
                    done();
                });
            });

            it('Immediately cancel a job', function (done) {
                var rule = new mongooseJob.RecurrenceRule();
                rule.second = null;
                mongooseJob.createJob('seconds-repeat2', {due: rule});
                var spy = jasmine.createSpy('jobHandler');
                mongooseJob.addJobHandler('seconds-repeat2', spy);
                mongooseJob.removeJob('seconds-repeat2');
                waits(3000);
                runs(function () {
                    expect(spy.callCount).toBe(0);
                    mongooseJob.Model.find({}, function (err, result) {
                        expect(result).toEqual([]);
                        done(err);
                    });
                });
            });
        });
    });
});