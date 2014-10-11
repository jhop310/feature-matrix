//NMTest

(function() {
    var Ext = window.Ext4 || window.Ext;

    Ext.define('FeatureSummaryMatrixApp', {
        extend: 'Rally.app.TimeboxScopedApp',
        componentCls: 'app',
        appName: 'Feature Summary Matrix',
        scopeType: 'release',

        comboboxConfig: {
            fieldLabel: 'Release ',
            labelAlign: 'right',
            labelWidth: 30,
            labelPad: 15,
            growToLongestValue: true,
            margin: '10px 0',
            minWidth: 230,
            padding: '0 0 0 5px'
        },

        clientMetrics: [
            {
                method: '_onMatrixCellClicked',
                description: 'matrix cell clicked'
            }
        ],

        initComponent: function() {
            this.callParent(arguments);
            this.mon(this, 'afterrender', function() {
                this.setLoading(true);
            }, this );

            Rally.data.ModelFactory.getModel({
                type:'PortfolioItem/Feature',
                success: this._onFeatureModelRetrieved,
                scope: this
            });
        },

        _addContent: function(scope) {
            this._hideComponentIfNeeded(this.defectGridHeader);
            this._hideComponentIfNeeded(this.defectGrid);

            this.releaseFilter = this.context.getTimeboxScope().getQueryFilter();
            if (this.allFeatureStore) {
                this.allFeatureStore.clearFilter(true);
                this.allFeatureStore.filter(this.releaseFilter);
            } else {
                this._initializeAllFeatureStore();
            }
        },

        onScopeChange: function(scope) {
            if (this.matrixGrid) {
                this.matrixGrid.setLoading(true);
            }
            this._addContent(scope);
        },

        onNoAvailableTimeboxes: function() {
            this.setLoading(false);
        },

        _onFeatureModelRetrieved: function(model) {
            this.defectModel = model;

            this._extractAllowedValues(model, ['State', 'Priority']).then({
                success: function(allowedValues) {
                    this.states = allowedValues.State;
                    console.log('this.states=allowedValues.State', this.states);
                    console.log('allowedValues', allowedValues);
                    this.priorities = allowedValues.Priority;
                    this._initializeAllFeatureStore();
                },
                scope: this
            });
        },

        _extractAllowedValues: function(defectModel, fieldNames) {
            var result = {};
            var that = this;
            that._statesObjects = [];
            var deferred = Ext.create('Deft.Deferred');

            _.each(fieldNames, function(fieldName) {
                defectModel.getField(fieldName).getAllowedValueStore().load({
                    callback: function(records, operation, success) {
                        var allowedValues = _.map(records, function(record) {
                            var value = record.get('StringValue');
                            var ref = record.get('_ref');
                            if (value === '') {
                                value = 'None';
                            }
                            if (fieldName === 'State') {
                                console.log('record...ref..state', record.get('_ref'));
                                that._statesObjects.push({name:value,ref:ref});
                            }
                            return value === '' ? 'None' : value;
                            
                        });

                        result[fieldName] = allowedValues;

                        if(_.keys(result).length === fieldNames.length) {
                            deferred.resolve(result);
                        }
                    }
                });
            });
            return deferred.promise;
        },

        _hideComponentIfNeeded: function(component) {
            if (component) {
                component.hide();
            }
        },

        _showComponentIfNeeded: function(component) {
            if (component && component.isHidden()) {
                component.show();
            }
        },

        _initializeAllFeatureStore: function() {
            if (this.releaseFilter && this.defectModel) {
                this.allFeatureStore = Ext.create('Rally.data.wsapi.Store', {
                    model: this.defectModel,
                    fetch: ['State','Priority'],
                    autoLoad: true,
                    limit: Infinity,
                    context: this.getContext().getDataContext(),
                    filters: this.releaseFilter,
                    listeners: {
                        load: this._onAllFeatureStoreLoaded,
                        scope: this
                    }
                });
            }
        },

        _onAllFeatureStoreLoaded: function(store, records, successful, eOpts) {
            this._initializeMatrixTable();
            this._populateMatrixTable(records);
            this._createPriorityRecords(records);
            this._updateMatrixGrid();
            this.setLoading(false);
        },

        _initializeMatrixTable: function() {
            this.matrixTable = [];
            Ext.each(this.priorities, function(priority, pIndex) {
                this.matrixTable[pIndex] = [];
                Ext.each(this.states, function(state, sIndex) {
                    this.matrixTable[pIndex][sIndex] = 0;
                }, this);
            }, this);
        },

        _populateMatrixTable: function(defectRecords) {
            console.log('...matix table...',this.matrixTable );
            var priorityIndex, stateIndex;
            Ext.each(defectRecords, function(record) {
                var priority = record.get('Priority');
                if (!priority) {
                    console.log('priority equals none');
                    priority = 'None';
                }
                var state = record.get('State');
                if (!state) {
                    state = 'None';
                }
                else{
                    console.log('State....', record.get('State'));
                    state = record.get('State')._refObjectName;
                }
                priorityIndex = this._determinePriorityIndex(priority,record);
                stateIndex = this._determineStateIndex(state,record);
                console.log('priorityIndex, stateIndex',priorityIndex, stateIndex);
                this.matrixTable[priorityIndex][stateIndex]++;
            }, this);
        },

        _determinePriorityIndex: function(value,record) {
            console.log('_determinePriorityIndex', record, value,this.priorities.indexOf(value));
            return this.priorities.indexOf(value);
        },

        _determineStateIndex: function(value,record) {
            console.log('_determineStateIndex', record, 'value:' ,value,this.states.indexOf(value));
            console.log('this.states in determineStateIndex', this.states);
            return this.states.indexOf(value);
        },

        _createPriorityRecords: function(defectRecords) {
            var currentRecord,
                rowTotal,
                colTotals = new Array(this.states);
            this.priorityRecords = [];

            Ext.each(this.states, function(state, sIndex) {
                colTotals[sIndex] = 0;
            });

            Ext.each(this.matrixTable, function(stateArray, priorityIndex){
                currentRecord = {Priority: this.priorities[priorityIndex]};
                rowTotal = 0;
                Ext.each(stateArray, function(numFeatures, stateIndex) {
                    currentRecord[this.states[stateIndex]] = this._createDetailLink(numFeatures);
                    rowTotal += numFeatures;
                    colTotals[stateIndex] += numFeatures;
                }, this);
                currentRecord.RowTotal = this._createDetailLink(rowTotal);
                this.priorityRecords.push(currentRecord);
            }, this);

            currentRecord = {Priority: 'Total'};
            Ext.each(this.states, function(state, sIndex) {
                currentRecord[state] = this._createDetailLink(colTotals[sIndex]);
            }, this);
            currentRecord.RowTotal = this._createDetailLink(defectRecords.length);

            this.priorityRecords.push(currentRecord);
        },

        _updateMatrixGrid: function() {
            var newMatrixGridStore = this._createMatrixGridStore();

            if (this.matrixGrid) {
                this.matrixGrid.getView().bindStore(newMatrixGridStore);
                this.matrixGrid.setLoading(false);
            } else {
                this._createMatrixGrid(newMatrixGridStore);
            }
        },

        _createMatrixGridStore: function() {
            return Ext.create('Rally.data.custom.Store', {
                data: this.priorityRecords,
                pageSize: this.priorityRecords.length
            });
        },

        _createMatrixGrid: function(store) {
            this.matrixGrid = this.add(Ext.create('Rally.ui.grid.Grid', {
                store: store,
                showPagingToolbar: false,
                sortableColumns: false,
                showRowActionsColumn: false,
                columnCfgs: this._buildColumns(),
                listeners: {
                    cellclick: this._onMatrixCellClicked,
                    scope: this
                }
            }));
        },

        _buildColumns: function() {
            var columns = [
                {
                  text: "",
                  dataIndex: 'Priority',
                  flex: 0.4
                }
            ];

            Ext.each(this.states, function(state) {
                columns.push({
                    text: state,
                    dataIndex: state,
                    flex: 0.3
                });
            });


            columns.push({
                text: "Total",
                dataIndex: 'RowTotal',
                flex: 0.3
            });

            return columns;
        },

        _createDetailLink: function(count) {
            return "<a href='#' onclick='return false;'>" + count + "</a>";
        },

        _onMatrixCellClicked: function(table, td, cellIndex, record, tr, rowIndex, e, eOpts) {
            cellIndex--;
            if (cellIndex >= 0) {
                this._updateFeatureGrid(rowIndex, cellIndex);
            }
        },

        _updateFeatureGrid: function(priorityIndex, stateIndex) {
            var priority = this.priorities[priorityIndex],
                state = this.states[stateIndex],
                allPriorities = (typeof priority === "undefined"),
                allStates = (typeof state === "undefined"),
                newTitle = this._determineFeatureGridTitle(priority, state, allPriorities, allStates),
                newFilters = this._createNewFeatureFilters(priority, state, allPriorities, allStates);

            if (this.defectGrid) {
                this._changeFeatureGridTitleAndFilters(newTitle, newFilters);
            } else {
                this._createFeatureGrid(newTitle, newFilters);
            }
        },

        _createFeatureGrid: function(title, filters) {
            this.defectGridHeader = this.add({
                xtype: 'component',
                itemId: 'defectGridHeader',
                html: title,
                style: {
                    padding: '20px 0 6px 0',
                    width: '100%',
                    textAlign: 'center',
                    fontWeight: 'bold'
                }
            });
            this.defectGrid = this.add({
                xtype: 'rallygrid',
                itemId: 'defectGrid',
                model: this.defectModel,
                storeConfig: {
                    filters: filters
                },
                autoLoad: false,
                columnCfgs:['FormattedID', 'Name', 'State', 'Priority'],
                limit: Infinity,
                enableEditing: false,
                margin: '0 0 10px 0'
            });
            console.log('store', this.defectGrid.getStore());
        },

        _changeFeatureGridTitleAndFilters: function(newTitle, newFilters) {
            this.defectGridHeader.update(newTitle);
            this.defectGrid.getStore().clearFilter(true);
            this.defectGrid.getStore().filter(newFilters);

            this._showComponentIfNeeded(this.defectGridHeader);
            this._showComponentIfNeeded(this.defectGrid);
        },

        _createNewFeatureFilters: function(priority, state, allPriorities, allStates) {
            if (state === "None") {
                console.log("State is NONE!!!");
            }
            if (priority === "None") {
                console.log("Priority is NONE!!!");
                priority = "";
            }
            var newFilters = [this.releaseFilter];
            var currentStateRef = '';
            console.log('statesObj:', this._statesObjects);
            
            _.each(this._statesObjects, function(stateObj){
                console.log('stateObj outside of if',stateObj);
                if (stateObj.name === state) {
                    console.log('equal', stateObj.name, state);
                    currentStateRef = stateObj.ref;
                }
            });
            
            console.log('currentStateRef', currentStateRef);

            if (!allPriorities) {
                newFilters.push({
                    property: 'Priority',
                    value: priority
                });
            }
            if (!allStates) {
                newFilters.push({
                    property: 'State',
                    value: currentStateRef
                });
            }

            return newFilters;
        },

        _determineFeatureGridTitle: function(priority, state, allPriorities, allStates) {
            if (!allStates && !allPriorities) {
                if (priority === 'None') {
                    if (state === 'None') {
                        return 'Features Without a Priority and a State';
                    }
                    else{
                        return state + ' Features Without a Priority';
                    }
                    
                } else if (state === 'None') {
                    return priority + ' Features Without a State';
                } else {
                    return 'Features With State ' + state + ' and Priority ' + priority ;
                }
            } else if (allStates && allPriorities) {
                return 'All Features';
            } else if (allPriorities) {
                return 'All Features With State ' + state;
            } else if (allStates) {
                if (priority === 'None') {
                    return 'All Features Without a Priority';
                } else {
                    return 'All ' + priority + ' Features';
                }
            }
            return '';
        }
    });
})();