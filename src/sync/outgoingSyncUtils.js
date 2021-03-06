import { Client as BugsnagClient } from 'bugsnag-react-native';

import {
  INTERNAL_TO_EXTERNAL,
  RECORD_TYPES,
  REQUISITION_STATUSES,
  REQUISITION_TYPES,
  SEQUENCE_KEYS,
  STATUSES,
  SYNC_TYPES,
  TRANSACTION_BATCH_TYPES,
  TRANSACTION_TYPES,
} from './syncTranslators';

import { SETTINGS_KEYS } from '../settings';
const { SUPPLYING_STORE_NAME_ID, THIS_STORE_ID, SYNC_URL, SYNC_SITE_NAME } = SETTINGS_KEYS;
import { CHANGE_TYPES } from '../database';

const bugsnagClient = new BugsnagClient();

/**
 * Returns a json object fulfilling the requirements of the mSupply primary sync
 * server, based on a given syncOutRecord
 * @param  {Realm}        database      The local database
 * @param  {Settings}     settings      Access to local settings
 * @param  {Realm.object} syncOutRecord The sync out record to be translated
 * @return {object}                     The generated json object, ready to sync
 */
export function generateSyncJson(database, settings, syncOutRecord) {
  if (!syncOutRecord || !syncOutRecord.isValid()) throw new Error('Missing sync out record');
  if (!syncOutRecord.recordType || !syncOutRecord.id || !syncOutRecord.recordId) {
    throw new Error('Malformed sync out record');
  }
  const { recordType, recordId, changeType } = syncOutRecord;
  const storeId = settings.get(THIS_STORE_ID);
  // Create the JSON object to sync
  const syncJson = {
    SyncID: syncOutRecord.id,
    RecordType: RECORD_TYPES.translate(recordType, INTERNAL_TO_EXTERNAL),
    RecordID: recordId,
    SyncType: SYNC_TYPES.translate(changeType, INTERNAL_TO_EXTERNAL),
    StoreID: storeId,
  };
  if (changeType === CHANGE_TYPES.DELETE) {
    return syncJson; // Don't need record data for deletes
  }

  let syncData;
  if (syncOutRecord.changeType === 'delete') {
    // If record has been deleted, just sync up the ID
    syncData = { ID: recordId };
  } else {
    // Get the record the syncOutRecord refers to from the database
    const recordResults = database.objects(recordType).filtered('id == $0', recordId);
    if (!recordResults || recordResults.length === 0) {
      // No such record
      throw new Error(`${recordType} with id = ${recordId} missing`);
    } else if (recordResults.length > 1) {
      // Duplicate records
      throw new Error(`Multiple ${recordType} records with id = ${recordId}`);
    }
    const record = recordResults[0];

    // Generate the appropriate data for the sync object to carry, representing the
    // record in its upstream form
    try {
      syncData = generateSyncData(settings, recordType, record);
    } catch (error) {
      // There was an error with data, often a null object
      const siteName = settings.get(SYNC_SITE_NAME);
      const syncUrl = settings.get(SYNC_URL);
      const originalMessage = error.message;

      // Change error message to be helpful in bugsnag
      error.message =
        `SYNC OUT ERROR. siteName: ${siteName}, serverUrl: ${syncUrl}, ` +
        `syncOutRecord.id: ${syncOutRecord.id}, storeId: ${storeId} changeType: ${changeType}, ` +
        `recordType: ${recordType}, recordId: ${recordId}, message: ${originalMessage}`;

      // Ping the error off to bugsnag
      bugsnagClient.notify(error);

      // Make a nicer message for users and throw it again.
      error.message = `There was an error syncing. Contact mSupply mobile support. ${originalMessage}`;
      throw error;
    }
  }

  // Attach the record data to the json object
  syncJson.Data = syncData;
  return syncJson;
}

/**
 * Turn an internal database object into data representing a record in the
 * mSupply primary server, ready for sync
 * @param  {Settings}     settings   Access to local settings
 * @param  {string}       recordType Internal type of record being synced
 * @param  {Realm.object} record     The record being synced
 * @return {object}                  The data to sync (in the form of upstream record)
 */
function generateSyncData(settings, recordType, record) {
  switch (recordType) {
    case 'ItemBatch': {
      return {
        ID: record.id,
        store_ID: settings.get(THIS_STORE_ID),
        item_ID: record.itemId,
        pack_size: String(record.packSize),
        expiry_date: getDateString(record.expiryDate),
        batch: record.batch,
        available: String(record.numberOfPacks),
        quantity: String(record.numberOfPacks),
        stock_on_hand_tot: String(record.totalQuantity),
        cost_price: String(record.costPrice),
        sell_price: String(record.sellPrice),
        total_cost: String(record.costPrice * record.numberOfPacks),
        name_ID: settings.get(SUPPLYING_STORE_NAME_ID),
      };
    }
    case 'NumberSequence': {
      const thisStoreId = settings.get(THIS_STORE_ID);
      return {
        ID: record.id,
        name: SEQUENCE_KEYS.translate(record.sequenceKey, INTERNAL_TO_EXTERNAL, thisStoreId),
        value: String(record.highestNumberUsed),
      };
    }
    case 'NumberToReuse': {
      const thisStoreId = settings.get(THIS_STORE_ID);
      return {
        ID: record.id,
        name: SEQUENCE_KEYS.translate(record.sequenceKey, INTERNAL_TO_EXTERNAL, thisStoreId),
        number_to_use: String(record.number),
      };
    }
    case 'Requisition': {
      return {
        ID: record.id,
        date_entered: getDateString(record.entryDate),
        user_ID: record.enteredById,
        name_ID: record.otherStoreName && record.otherStoreName.id,
        status: REQUISITION_STATUSES.translate(record.status, INTERNAL_TO_EXTERNAL),
        daysToSupply: String(record.daysToSupply),
        store_ID: settings.get(THIS_STORE_ID),
        serial_number: record.serialNumber,
        requester_reference: record.requesterReference,
        comment: record.comment,
        type: REQUISITION_TYPES.translate(record.type, INTERNAL_TO_EXTERNAL),
      };
    }
    case 'RequisitionItem': {
      return {
        ID: record.id,
        requisition_ID: record.requisitionId,
        item_ID: record.itemId,
        stock_on_hand: String(record.stockOnHand),
        daily_usage: String(record.dailyUsage),
        suggested_quantity: String(record.suggestedQuantity),
        actualQuan: String(record.suppliedQuantity),
        line_number: String(record.sortIndex),
        Cust_stock_order: String(record.requiredQuantity),
        comment: record.comment,
      };
    }
    case 'Stocktake': {
      return {
        ID: record.id,
        Description: record.name,
        stock_take_date: getDateString(record.stocktakeDate),
        stock_take_time: getTimeString(record.stocktakeDate),
        created_by_ID: record.createdBy && record.createdBy.id,
        status: STATUSES.translate(record.status, INTERNAL_TO_EXTERNAL),
        finalised_by_ID: record.finalisedBy && record.finalisedBy.id,
        invad_additions_ID: record.additions && record.additions.id,
        invad_reductions_ID: record.reductions && record.reductions.id,
        store_ID: settings.get(THIS_STORE_ID),
        comment: record.comment,
        stock_take_created_date: getDateString(record.createdDate),
        serial_number: record.serialNumber,
      };
    }
    case 'StocktakeBatch': {
      return {
        ID: record.id,
        stock_take_ID: record.stocktake && record.stocktake.id,
        item_line_ID: record.itemBatchId,
        snapshot_qty: String(record.snapshotNumberOfPacks),
        snapshot_packsize: String(record.packSize),
        stock_take_qty: String(record.countedNumberOfPacks),
        line_number: String(record.sortIndex),
        expiry: getDateString(record.expiryDate),
        cost_price: String(record.costPrice),
        sell_price: String(record.sellPrice),
        Batch: record.batch,
        item_ID: record.itemId,
      };
    }
    case 'Transaction': {
      return {
        ID: record.id,
        name_ID: record.otherParty && record.otherParty.id,
        invoice_num: record.serialNumber,
        comment: record.comment,
        entry_date: getDateString(record.entryDate),
        type: TRANSACTION_TYPES.translate(record.type, INTERNAL_TO_EXTERNAL),
        status: STATUSES.translate(record.status, INTERNAL_TO_EXTERNAL),
        mode: 'store',
        total: String(record.totalPrice),
        their_ref: record.theirRef,
        confirm_date: getDateString(record.confirmDate),
        subtotal: String(record.totalPrice),
        user_ID: record.enteredBy && record.enteredBy.id,
        category_ID: record.category && record.category.id,
        confirm_time: getTimeString(record.confirmDate),
        store_ID: settings.get(THIS_STORE_ID),
        requisition_ID:
          record.linkedRequisition && record.linkedRequisition.id
            ? record.linkedRequisition.id
            : undefined,
      };
    }
    case 'TransactionBatch': {
      const transaction = record.transaction;
      return {
        ID: record.id,
        transaction_ID: record.transaction.id,
        item_ID: record.itemId,
        batch: record.batch,
        price_extension: String(record.totalPrice),
        note: record.note,
        cost_price: String(record.costPrice),
        sell_price: String(record.sellPrice),
        expiry_date: getDateString(record.expiryDate),
        pack_size: String(record.packSize),
        quantity: String(record.numberOfPacks),
        // item_line_ID Should never be null. Can become null if merge
        // deleted it (old server bug, v3.83).
        item_line_ID: safeGet(record, 'itemBatch.id'),
        line_number: String(record.sortIndex),
        item_name: record.itemName,
        is_from_inventory_adjustment: transaction.isInventoryAdjustment,
        type: TRANSACTION_BATCH_TYPES.translate(transaction.type, INTERNAL_TO_EXTERNAL),
      };
    }
    default:
      throw new Error('Sync out record type not supported.');
  }
}

function getDateString(date) {
  let returnDate = '0000-00-00';
  if (date && typeof date === 'object') returnDate = date.toISOString().slice(0, 10);

  return `${returnDate}T00:00:00`;
}

function getTimeString(date) {
  if (!date || typeof date !== 'object') return '00:00:00';
  return date.toTimeString().substring(0, 8);
}

/**
 * Tries to get a value that is known to potentially lead to crash
 * If path on the record returns null, throw an error with prototype
 * extended with 'canDeleteSyncOut' set to true so sync knows to continue
 * @param {object} record The object to get properties from
 * @param {string} path   The path on that object safely try
 * @return {any}          Whatever variable was stored at path, if no error thrown
 */
function safeGet(record, path) {
  const pathSegments = path.split('.');
  let currentPath = 'record';
  let nestedProp = record;
  for (let i = 0; i < pathSegments.length; i++) {
    const segment = pathSegments[i];
    currentPath += `.${segment}`; // build up path so we know at what point potential errors occur
    try {
      nestedProp = nestedProp[segment];
    } catch (error) {
      error.canDeleteSyncOut = true; // safe to delete syncOut
      error.message = `Error on object getter on path "${currentPath}", original message: ${
        error.message
        }`;
      throw error; // Pass error up to next handler
    }
  }
  return nestedProp;
}
