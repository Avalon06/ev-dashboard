import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { SpinnerService } from 'app/services/spinner.service';
import { EndDateFilter } from 'app/shared/table/filters/end-date-filter';
import { StartDateFilter } from 'app/shared/table/filters/start-date-filter';
import { DataResult } from 'app/types/DataResult';
import { ButtonAction } from 'app/types/GlobalType';
import { Log } from 'app/types/Log';
import { ButtonType, TableActionDef, TableColumnDef, TableDef, TableFilterDef } from 'app/types/Table';
import saveAs from 'file-saver';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { AuthorizationService } from '../../../services/authorization.service';
import { CentralServerNotificationService } from '../../../services/central-server-notification.service';
import { CentralServerService } from '../../../services/central-server.service';
import { DialogService } from '../../../services/dialog.service';
import { MessageService } from '../../../services/message.service';
import { AppDatePipe } from '../../../shared/formatters/app-date.pipe';
import { TableAutoRefreshAction } from '../../../shared/table/actions/table-auto-refresh-action';
import { TableExportAction } from '../../../shared/table/actions/table-export-action';
import { TableRefreshAction } from '../../../shared/table/actions/table-refresh-action';
import { UserTableFilter } from '../../../shared/table/filters/user-table-filter';
import { TableDataSource } from '../../../shared/table/table-data-source';
import ChangeNotification from '../../../types/ChangeNotification';
import { Constants } from '../../../utils/Constants';
import { Formatters } from '../../../utils/Formatters';
import { Utils } from '../../../utils/Utils';
import { LogActionTableFilter } from '../filters/log-action-filter';
import { LogHostTableFilter } from '../filters/log-host-filter';
import { LogLevelTableFilter } from '../filters/log-level-filter';
import { LogSourceTableFilter } from '../filters/log-source-filter';
import { LogLevelFormatterComponent } from '../formatters/log-level-formatter.component';

@Injectable()
export class LogsListTableDataSource extends TableDataSource<Log> {
  constructor(
    public spinnerService: SpinnerService,
    public translateService: TranslateService,
    private messageService: MessageService,
    private dialogService: DialogService,
    private authorizationService: AuthorizationService,
    private router: Router,
    private centralServerNotificationService: CentralServerNotificationService,
    private centralServerService: CentralServerService,
    private datePipe: AppDatePipe) {
    super(spinnerService, translateService);
    // Init
    this.initDataSource();
  }

  public getDataChangeSubject(): Observable<ChangeNotification> {
    return this.centralServerNotificationService.getSubjectLoggings();
  }

  public loadDataImpl(): Observable<DataResult<Log>> {
    return new Observable((observer) => {
      // Get data
      this.centralServerService.getLogs(this.buildFilterValues(),
        this.getPaging(), this.getSorting()).subscribe((logs) => {
          // Add the users in the message
          logs.result.map((log: Log) => {
            let user;
            // Set User
            if (log.user) {
              user = log.user;
            }
            // Set Action On User
            if (log.actionOnUser) {
              user = (user ? `${user} > ${log.actionOnUser}` : log.actionOnUser);
            }
            // Set
            if (user) {
              log.message = `${user} > ${log.message}`;
            }
            return log;
          });
          // Ok
          observer.next(logs);
          observer.complete();
        }, (error) => {
          // No longer exists!
          Utils.handleHttpError(error, this.router, this.messageService, this.centralServerService, 'general.error_backend');
          // Error
          observer.error(error);
        });
    });
  }

  public getRowDetails(row: Log): Observable<string> {
    // Read the log details
    return this.centralServerService.getLog(row.id).pipe(
      map((log) => Formatters.formatTextToHTML(log.detailedMessages)));
  }

  public getPageSize(): number {
    return 200;
  }

  public buildTableDef(): TableDef {
    return {
      search: {
        enabled: true,
      },
      rowDetails: {
        enabled: true,
        detailsField: 'detailedMessages',
        showDetailsField: 'hasDetailedMessages',
      },
    };
  }

  public buildTableColumnDefs(): TableColumnDef[] {
    return [
      {
        id: 'level',
        name: 'logs.level',
        isAngularComponent: true,
        angularComponent: LogLevelFormatterComponent,
        headerClass: 'col-7p text-center',
        class: 'col-7p table-cell-angular-big-component',
        sortable: true,
      },
      {
        id: 'timestamp',
        type: 'date',
        formatter: (createdOn: Date) => this.datePipe.transform(createdOn),
        name: 'logs.date',
        headerClass: 'col-15p',
        class: 'text-left col-15p',
        sorted: true,
        direction: 'desc',
        sortable: true,
      },
      {
        id: 'host',
        name: 'logs.host',
        headerClass: 'col-15p',
        class: 'text-left col-15p',
        sortable: true,
      },
      {
        id: 'process',
        name: 'logs.process',
        headerClass: 'col-15p',
        class: 'text-left col-15p',
        sortable: true,
      },
      {
        id: 'source',
        name: 'logs.source',
        headerClass: 'col-15p',
        class: 'text-left col-15p',
        sortable: true,
      },
      {
        id: 'action',
        name: 'logs.action',
        headerClass: 'col-15p',
        class: 'text-left col-15p',
        sortable: true,
      },
      {
        id: 'message',
        name: 'logs.message',
        headerClass: 'col-50p',
        class: 'text-left col-50p',
        sortable: true,
      },
    ];
  }

  public buildTableActionsDef(): TableActionDef[] {
    const tableActionsDef = super.buildTableActionsDef();
    if (!this.authorizationService.isDemo()) {
      return [
        new TableExportAction().getActionDef(),
        ...tableActionsDef,
      ];
    }
    return tableActionsDef;
  }

  public actionTriggered(actionDef: TableActionDef) {
    switch (actionDef.id) {
      case ButtonAction.EXPORT:
        this.dialogService.createAndShowYesNoDialog(
          this.translateService.instant('logs.dialog.export.title'),
          this.translateService.instant('logs.dialog.export.confirm'),
        ).subscribe((response) => {
          if (response === ButtonType.YES) {
            this.exportLogs();
          }
        });
        break;
    }
  }

  public buildTableActionsRightDef(): TableActionDef[] {
    return [
      new TableAutoRefreshAction(false).getActionDef(),
      new TableRefreshAction().getActionDef(),
    ];
  }

  public buildTableFiltersDef(): TableFilterDef[] {
    if (this.authorizationService.isSuperAdmin()) {
      return [
        new StartDateFilter().getFilterDef(),
        new EndDateFilter().getFilterDef(),
        new LogLevelTableFilter().getFilterDef(),
        new LogActionTableFilter().getFilterDef(),
        new LogHostTableFilter().getFilterDef(),
        new UserTableFilter().getFilterDef(),
      ];
    }
    if (this.authorizationService.isAdmin()) {
      return [
        new StartDateFilter().getFilterDef(),
        new EndDateFilter().getFilterDef(),
        new LogLevelTableFilter().getFilterDef(),
        new LogActionTableFilter().getFilterDef(),
        new LogSourceTableFilter(this.authorizationService.getSitesAdmin()).getFilterDef(),
        new LogHostTableFilter().getFilterDef(),
        new UserTableFilter().getFilterDef(),
      ];
    }
    return [
      new StartDateFilter().getFilterDef(),
      new EndDateFilter().getFilterDef(),
      new LogLevelTableFilter().getFilterDef(),
      new LogActionTableFilter().getFilterDef(),
      new LogHostTableFilter().getFilterDef(),
      new LogSourceTableFilter(this.authorizationService.getSitesAdmin()).getFilterDef(),
      new UserTableFilter(this.authorizationService.getSitesAdmin()).getFilterDef()];
  }

  private exportLogs() {
    this.spinnerService.show();
    this.centralServerService.exportLogs(this.buildFilterValues(), {
      limit: this.getTotalNumberOfRecords(),
      skip: Constants.DEFAULT_SKIP,
    }, this.getSorting())
      .subscribe((result) => {
        this.spinnerService.hide();
        saveAs(result, 'exported-logs.csv');
      }, (error) => {
        this.spinnerService.hide();
        Utils.handleHttpError(error, this.router, this.messageService, this.centralServerService, 'general.error_backend');
      });
  }
}
