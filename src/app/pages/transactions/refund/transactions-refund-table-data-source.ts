import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { AppCurrencyPipe } from 'app/shared/formatters/app-currency.pipe';
import { TableExportTransactionsAction } from 'app/shared/table/actions/table-export-transactions-action';
import { TableOpenURLConcurAction } from 'app/shared/table/actions/table-open-url-concur-action';
import { TableSyncRefundAction } from 'app/shared/table/actions/table-sync-refund-action';
import { EndDateFilter } from 'app/shared/table/filters/end-date-filter';
import { StartDateFilter } from 'app/shared/table/filters/start-date-filter';
import { Action, Entity } from 'app/types/Authorization';
import { ActionsResponse, DataResult, TransactionRefundDataResult } from 'app/types/DataResult';
import { RefundButtonAction } from 'app/types/Refund';
import { RefundSettings } from 'app/types/Setting';
import { ButtonType, TableActionDef, TableColumnDef, TableDef, TableFilterDef } from 'app/types/Table';
import TenantComponents from 'app/types/TenantComponents';
import { Transaction, TransactionButtonAction } from 'app/types/Transaction';
import { User } from 'app/types/User';
import * as moment from 'moment';
import { Observable } from 'rxjs';

import { AuthorizationService } from '../../../services/authorization.service';
import { CentralServerNotificationService } from '../../../services/central-server-notification.service';
import { CentralServerService } from '../../../services/central-server.service';
import { ComponentService } from '../../../services/component.service';
import { DialogService } from '../../../services/dialog.service';
import { MessageService } from '../../../services/message.service';
import { SpinnerService } from '../../../services/spinner.service';
import { ConsumptionChartDetailComponent } from '../../../shared/component/consumption-chart/consumption-chart-detail.component';
import { AppConnectorIdPipe } from '../../../shared/formatters/app-connector-id.pipe';
import { AppDatePipe } from '../../../shared/formatters/app-date.pipe';
import { AppDurationPipe } from '../../../shared/formatters/app-duration.pipe';
import { AppPercentPipe } from '../../../shared/formatters/app-percent-pipe';
import { AppUnitPipe } from '../../../shared/formatters/app-unit.pipe';
import { AppUserNamePipe } from '../../../shared/formatters/app-user-name.pipe';
import { TableAutoRefreshAction } from '../../../shared/table/actions/table-auto-refresh-action';
import { TableRefreshAction } from '../../../shared/table/actions/table-refresh-action';
import { TableRefundAction } from '../../../shared/table/actions/table-refund-action';
import { ChargerTableFilter } from '../../../shared/table/filters/charger-table-filter';
import { ReportTableFilter } from '../../../shared/table/filters/report-table-filter';
import { SiteAreaTableFilter } from '../../../shared/table/filters/site-area-table-filter';
import { UserTableFilter } from '../../../shared/table/filters/user-table-filter';
import { TableDataSource } from '../../../shared/table/table-data-source';
import ChangeNotification from '../../../types/ChangeNotification';
import { Constants } from '../../../utils/Constants';
import { Utils } from '../../../utils/Utils';
import { TransactionsRefundStatusFilter } from '../filters/transactions-refund-status-filter';

@Injectable()
export class TransactionsRefundTableDataSource extends TableDataSource<Transaction> {
  private refundTransactionEnabled = false;
  private refundSetting!: RefundSettings;
  private isAdmin: boolean;
  private tableSyncRefundAction = new TableSyncRefundAction().getActionDef();

  constructor(
    public spinnerService: SpinnerService,
    public translateService: TranslateService,
    private messageService: MessageService,
    private dialogService: DialogService,
    private router: Router,
    private centralServerNotificationService: CentralServerNotificationService,
    private centralServerService: CentralServerService,
    private componentService: ComponentService,
    private authorizationService: AuthorizationService,
    private datePipe: AppDatePipe,
    private appUnitPipe: AppUnitPipe,
    private appPercentPipe: AppPercentPipe,
    private appConnectorIdPipe: AppConnectorIdPipe,
    private appUserNamePipe: AppUserNamePipe,
    private appDurationPipe: AppDurationPipe,
    private appCurrencyPipe: AppCurrencyPipe) {
    super(spinnerService, translateService);
    this.refundTransactionEnabled = this.authorizationService.canAccess(Entity.TRANSACTION, Action.REFUND_TRANSACTION);
    this.isAdmin = this.authorizationService.isAdmin();
    // Check
    this.checkConcurConnection();
    // Init
    this.initDataSource();
    // Add statistics to query
    this.setStaticFilters([{ Statistics: 'refund' }]);
  }

  public getDataChangeSubject(): Observable<ChangeNotification> {
    return this.centralServerNotificationService.getSubjectTransactions();
  }

  public loadDataImpl(): Observable<DataResult<Transaction>> {
    return new Observable((observer) => {
      const filters = this.buildFilterValues();
      filters['MinimalPrice'] = '0';
      this.centralServerService.getTransactionsToRefund(filters, this.getPaging(), this.getSorting())
        .subscribe((transactions) => {
          // Ok
          observer.next(transactions);
          observer.complete();
        }, (error) => {
          Utils.handleHttpError(error, this.router, this.messageService, this.centralServerService, 'general.error_backend');
          // Error
          observer.error(error);
        });
    });
  }

  public buildTableDef(): TableDef {
    return {
      search: {
        enabled: true,
      },
      rowSelection: {
        enabled: this.refundTransactionEnabled,
        multiple: this.refundTransactionEnabled,
      },
      rowDetails: {
        enabled: false,
        angularComponent: ConsumptionChartDetailComponent,
      },
    };
  }

  public buildTableFooterStats(data: TransactionRefundDataResult): string {
    // All records has been retrieved
    if (data.count !== Constants.INFINITE_RECORDS) {
      // Stats?
      if (data.stats) {
        // Total Consumption
        // tslint:disable-next-line:max-line-length
        let stats = `| ${this.translateService.instant('transactions.consumption')}: ${this.appUnitPipe.transform(data.stats.totalConsumptionWattHours, 'Wh', 'kWh', true, 1, 0)}`;
        // Refund transactions
        // tslint:disable-next-line:max-line-length
        stats += ` | ${this.translateService.instant('transactions.refund_transactions')}: ${data.stats.countRefundTransactions} (${this.appCurrencyPipe.transform(data.stats.totalPriceRefund, data.stats.currency)})`;
        // Pending transactions
        // tslint:disable-next-line:max-line-length
        stats += ` | ${this.translateService.instant('transactions.pending_transactions')}: ${data.stats.countPendingTransactions} (${this.appCurrencyPipe.transform(data.stats.totalPricePending, data.stats.currency)})`;
        // Number of reimbursed reports submitted
        // tslint:disable-next-line:max-line-length
        stats += ` | ${this.translateService.instant('transactions.count_refunded_reports')}: ${data.stats.countRefundedReports}`;
        return stats;
      }
    }
    return '';
  }

  public buildTableColumnDefs(): TableColumnDef[] {
    const columns: TableColumnDef[] = [];
    columns.push(
      {
        id: 'id',
        name: 'transactions.id',
        headerClass: 'd-none d-xl-table-cell',
        class: 'd-none d-xl-table-cell',
      },
      {
        id: 'user',
        name: 'transactions.user',
        class: 'text-left',
        formatter: (user: User) => this.appUserNamePipe.transform(user),
      },
      {
        id: 'refundData.reportId',
        name: 'transactions.reportId',
        sortable: true,
      },
      {
        id: 'refundData.refundedAt',
        name: 'transactions.refundDate',
        sortable: true,
        formatter: (refundedAt) => this.datePipe.transform(refundedAt),
      },
      {
        id: 'refundData.status',
        name: 'transactions.state',
        formatter: (value) => this.translateService.instant(`transactions.refund_${value}`),
      },
      {
        id: 'timestamp',
        name: 'transactions.started_at',
        class: 'text-left',
        sorted: true,
        sortable: true,
        direction: 'desc',
        formatter: (value) => this.datePipe.transform(value),
      },
      {
        id: 'stop.totalDurationSecs',
        name: 'transactions.duration',
        class: 'text-left',
        formatter: (totalDurationSecs) => this.appDurationPipe.transform(totalDurationSecs),
      }, {
      id: 'stop.totalConsumption',
      name: 'transactions.total_consumption',
      formatter: (totalConsumption) => this.appUnitPipe.transform(totalConsumption, 'Wh', 'kWh'),
    }, {
      id: 'stop.price',
      name: 'transactions.price',
      formatter: (price, row) => this.appCurrencyPipe.transform(price, row.stop.priceUnit),
    }, {
      id: 'chargeBoxID',
      name: 'transactions.charging_station',
      class: 'text-left',
      formatter: (chargingStation, row) => this.formatChargingStation(chargingStation, row),
    });

    return columns as TableColumnDef[];
  }

  public formatInactivity(totalInactivitySecs: number, row: Transaction) {
    const percentage = row.stop.totalDurationSecs > 0 ? (totalInactivitySecs / row.stop.totalDurationSecs) : 0;
    if (percentage === 0) {
      return '';
    }
    return this.appDurationPipe.transform(totalInactivitySecs) +
      ` (${this.appPercentPipe.transform(percentage, '2.0-0')})`;
  }

  public formatChargingStation(chargingStationID: string, row: Transaction) {
    return `${chargingStationID} - ${this.appConnectorIdPipe.transform(row.connectorId)}`;
  }

  public buildTableFiltersDef(): TableFilterDef[] {
    const filters: TableFilterDef[] = [
      new StartDateFilter(moment().startOf('y').toDate()).getFilterDef(),
      new EndDateFilter().getFilterDef(),
      new TransactionsRefundStatusFilter().getFilterDef(),
    ];
    if (this.authorizationService.isAdmin() || this.authorizationService.hasSitesAdminRights()) {
      if (this.componentService.isActive(TenantComponents.ORGANIZATION)) {
        filters.push(new ChargerTableFilter(this.authorizationService.getSitesAdmin()).getFilterDef());
        filters.push(new SiteAreaTableFilter(this.authorizationService.getSitesAdmin()).getFilterDef());
        filters.push(new UserTableFilter(this.authorizationService.getSitesAdmin()).getFilterDef());
        filters.push(new ReportTableFilter().getFilterDef());
      }
    }
    return filters;
  }

  public buildTableActionsDef(): TableActionDef[] {
    let tableActionsDef = super.buildTableActionsDef();
    tableActionsDef.unshift(new TableExportTransactionsAction().getActionDef());
    if (this.refundTransactionEnabled) {
      tableActionsDef = [
        ...tableActionsDef,
        new TableRefundAction().getActionDef(),
        new TableOpenURLConcurAction().getActionDef(),
      ];
      if (this.isAdmin) {
        tableActionsDef.push(
          this.tableSyncRefundAction,
        );
      }
    }
    return tableActionsDef;
  }

  public actionTriggered(actionDef: TableActionDef) {
    switch (actionDef.id) {
      case RefundButtonAction.SYNCHRONIZE:
        if (this.tableSyncRefundAction.action) {
          this.tableSyncRefundAction.action(
            this.dialogService, this.translateService, this.messageService, this.centralServerService,
            this.spinnerService, this.router, this.refreshData.bind(this)
          );
        }
        break;
      case TransactionButtonAction.REFUND:
        if (!this.refundSetting) {
          this.messageService.showErrorMessage(this.translateService.instant('transactions.notification.refund.concur_connection_invalid'));
        } else if (this.getSelectedRows().length === 0) {
          this.messageService.showErrorMessage(this.translateService.instant('general.select_at_least_one_record'));
        } else {
          this.dialogService.createAndShowYesNoDialog(
            this.translateService.instant('transactions.dialog.refund.title'),
            this.translateService.instant('transactions.dialog.refund.confirm', { quantity: this.getSelectedRows().length }),
          ).subscribe((response) => {
            if (response === ButtonType.YES) {
              this.refundTransactions(this.getSelectedRows());
            }
          });
        }
        break;
      case TransactionButtonAction.OPEN_CONCUR_URL:
        if (!this.refundSetting) {
          this.messageService.showErrorMessage(
            this.translateService.instant('transactions.notification.refund.concur_connection_invalid'));
        } else if (this.refundSetting && this.refundSetting.content && this.refundSetting.content.concur && actionDef.action) {
          actionDef.action(this.refundSetting.content.concur.appUrl ?
            this.refundSetting.content.concur.appUrl :
            this.refundSetting.content.concur.apiUrl);
        }
        break;
      case TransactionButtonAction.EXPORT_TRANSACTIONS:
        if (actionDef.action) {
          actionDef.action(this.buildFilterValues(), this.getSorting(), this.dialogService,
            this.translateService, this.messageService, this.centralServerService, this.router,
            this.spinnerService);
        }
        break;
    }
  }

  public buildTableActionsRightDef(): TableActionDef[] {
    return [
      new TableAutoRefreshAction(false).getActionDef(),
      new TableRefreshAction().getActionDef(),
    ];
  }

  public isSelectable(row: Transaction) {
    return this.authorizationService.isSiteOwner(row.siteID) && (!row.refundData || row.refundData.status === 'cancelled');
  }

  protected refundTransactions(transactions: Transaction[]) {
    this.spinnerService.show();
    this.centralServerService.refundTransactions(transactions.map((transaction) => transaction.id))
      .subscribe((response: ActionsResponse) => {
        if (response.inError) {
          this.messageService.showErrorMessage(
            this.translateService.instant('transactions.notification.refund.partial',
              {
                inSuccess: response.inSuccess,
                inError: response.inError,
              },
            ));
        } else {
          this.messageService.showSuccessMessage(
            this.translateService.instant('transactions.notification.refund.success',
              { inSuccess: response.inSuccess },
            ));
        }
        this.spinnerService.hide();
        this.clearSelectedRows();
        this.refreshData().subscribe();
    }, (error: any) => {
      this.spinnerService.hide();
      switch (error.status) {
        case 560: // not authorized
          Utils.handleHttpError(error, this.router, this.messageService,
            this.centralServerService, 'transactions.notification.refund.not_authorized');
          break;
        case 551: // cannot refund another user transactions
          Utils.handleHttpError(error, this.router, this.messageService,
            this.centralServerService, 'transactions.notification.refund.forbidden_refund_another_user');
          break;
        default:
          Utils.handleHttpError(error, this.router, this.messageService,
            this.centralServerService, 'transactions.notification.refund.error');
          break;
      }
    });
  }

  private checkConcurConnection() {
    if (this.authorizationService.canListSettings()) {
      this.centralServerService.getSettings(TenantComponents.REFUND).subscribe((settingResult) => {
        if (settingResult && settingResult.result && settingResult.result.length > 0) {
          this.refundSetting = settingResult.result[0] as RefundSettings;
        }
      });
    }
  }
}
