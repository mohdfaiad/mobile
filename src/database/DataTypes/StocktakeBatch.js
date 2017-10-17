import Realm from 'realm';
import { createRecord } from '../utilities';

export class StocktakeBatch extends Realm.Object {

  destructor(database) {
    // Delete ItemBatch that was created as a result of creating this StocktakeBatch
    if (this.snapshotNumberOfPacks === 0 && this.itemBatch.numberOfPacks === 0) {
      database.delete('ItemBatch', this.itemBatch);
    }
  }

  get snapshotTotalQuantity() {
    return this.snapshotNumberOfPacks * this.packSize;
  }

  get countedTotalQuantity() {
    return this.countedNumberOfPacks * this.packSize;
  }

  get itemId() {
    if (!this.itemBatch) return '';
    return this.itemBatch.item ? this.itemBatch.item.id : '';
  }

  get itemBatchId() {
    return this.itemBatch ? this.itemBatch.id : '';
  }

  get difference() {
    return this.countedTotalQuantity - this.snapshotTotalQuantity;
  }

  set countedTotalQuantity(quantity) {
    this.countedNumberOfPacks = this.packSize ? quantity / this.packSize : 0;
  }

  /**
   * Finalising StocktakeBatch will adjust inventory appropriatly and will add
   * new TransactionBatch in reducing or increasing Transactino for this Stocktake
   * @param  {Realm}  database   App wide local database
   * @param  {object} user       The user that finalised this stocktake
   */
  finalise(database, user) {
    const isAddition = this.countedTotalQuantity > this.snapshotTotalQuantity;
    const inventoryAdjustement = isAddition ? this.stocktake.getAdditions(database, user)
                                            : this.stocktake.getReductions(database, user);
    // Adjust inventory
    this.itemBatch.batch = this.batch;
    this.itemBatch.numberOfPacks = this.countedNumberOfPacks;
    this.itemBatch.expiryDate = this.expiryDate;
    // Create TransactionItem, TransactionBatch to store inventory adjustement in this Stocktake
    const item = this.itemBatch.item;
    const transactionItem = createRecord(database, 'TransactionItem', inventoryAdjustement, item);
    const transactionBatch = createRecord(database, 'TransactionBatch',
                                          transactionItem, this.itemBatch);
    transactionBatch.numberOfPacks = Math.abs(this.snapshotTotalQuantity
                                              - this.countedTotalQuantity);

    database.save('ItemBatch', this.itemBatch);
    database.save('TransactionBatch', transactionBatch);
  }

  toString() {
    return `Stocktake batch representing ${this.itemBatch}`;
  }
}

StocktakeBatch.schema = {
  name: 'StocktakeBatch',
  primaryKey: 'id',
  properties: {
    id: 'string',
    stocktake: 'Stocktake',
    itemBatch: 'ItemBatch',
    snapshotNumberOfPacks: 'double',
    packSize: 'double',
    expiryDate: { type: 'date', optional: true },
    batch: 'string',
    costPrice: 'double',
    sellPrice: 'double',
    countedNumberOfPacks: { type: 'double', optional: true },
    sortIndex: { type: 'int', optional: true },
  },
};
