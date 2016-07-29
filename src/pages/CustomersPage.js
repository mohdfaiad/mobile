/* @flow weak */

/**
 * mSupply Mobile
 * Sustainable Solutions (NZ) Ltd. 2016
 */

import React from 'react';
import { GenericTablePage } from './GenericTablePage';

const DATA_TYPES_DISPLAYED = ['Name'];

/**
* Renders the page for displaying Customers.
* @prop   {Realm}               database      App wide database.
* @prop   {func}                navigateTo    CallBack for navigation stack.
* @state  {Realm.Results}       transactions  Filtered to have only supplier_invoice.
*/
export class CustomersPage extends GenericTablePage {
  constructor(props) {
    super(props);
    this.state.sortBy = 'name';
    this.state.customers = props.database.objects('Customer');
    this.columns = COLUMNS;
    this.dataTypesDisplayed = DATA_TYPES_DISPLAYED;
    this.getUpdatedData = this.getUpdatedData.bind(this);
    this.onRowPress = this.onRowPress.bind(this);
  }

  onRowPress(customer) {
    this.props.navigateTo(
      'customer',
      `${customer.name}`,
      { customer: customer },
    );
  }

  /**
   * Returns updated data according to searchTerm, sortBy and isAscending.
   */
  getUpdatedData(searchTerm, sortBy, isAscending) {
    let data = this.state.customers
                         .filtered('name BEGINSWITH[c] $0 OR code BEGINSWITH[c] $0', searchTerm);

    switch (sortBy) {
      case 'transactions.length': // Special case for correct number based sorting
        // Convert to javascript array obj then sort with standard array functions.
        data = data.slice().sort((a, b) =>
          a.transactions.length - b.transactions.length); // 0,1,2,3...
        if (!isAscending) data.reverse(); // ...3,2,1,0
        break;
      default:
        data = data.sorted(sortBy, !isAscending); // 2nd arg: reverse sort
        break;
    }
    return data;
  }

  renderCell(key, customer) {
    switch (key) {
      default:
      case 'code':
        return customer.code;
      case 'name':
        return customer.name;
      case 'transactions.length':
        return customer.transactions.length;
    }
  }
}

CustomersPage.propTypes = {
  database: React.PropTypes.object,
  navigateTo: React.PropTypes.func.isRequired,
  settings: React.PropTypes.object.isRequired,
};

const COLUMNS = [
  {
    key: 'code',
    width: 1,
    title: 'CODE',
    sortable: true,
  },
  {
    key: 'name',
    width: 5,
    title: 'NAME',
    sortable: true,
  },
  {
    key: 'transactions.length',
    width: 1,
    title: 'INVOICES',
    alignText: 'right',
    sortable: true,
  },
];
