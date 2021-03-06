import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { SpinnerService } from 'app/services/spinner.service';
import { CarCatalog } from 'app/types/Car';
import { DataResult } from 'app/types/DataResult';
import { TableColumnDef } from 'app/types/Table';
import { Observable } from 'rxjs';

import { CentralServerService } from '../../../services/central-server.service';
import { MessageService } from '../../../services/message.service';
import { Utils } from '../../../utils/Utils';
import { DialogTableDataSource } from '../dialog-table-data-source';

@Injectable()
export class CarCatalogsDialogTableDataSource extends DialogTableDataSource<CarCatalog> {
  constructor(
      public spinnerService: SpinnerService,
      public translateService: TranslateService,
      private messageService: MessageService,
      private router: Router,
      private centralServerService: CentralServerService) {
    super(spinnerService, translateService);
    // Init
    this.initDataSource();
  }

  public loadDataImpl(): Observable<DataResult<CarCatalog>> {
    return new Observable((observer) => {
      // Get data
      this.centralServerService.getCarCatalogs(this.buildFilterValues(),
        this.getPaging(), this.getSorting()).subscribe((CarCatalogs) => {
          // Ok
          observer.next(CarCatalogs);
          observer.complete();
        }, (error) => {
          // No longer exists!
          Utils.handleHttpError(error, this.router, this.messageService, this.centralServerService, 'general.error_backend');
          // Error
          observer.error(error);
        });
    });
  }

  public buildTableColumnDefs(): TableColumnDef[] {
    return [
      {
        id: 'vehicleMake',
        name: 'cars.vehicle_make',
        class: 'text-left col-30p',
        sorted: true,
        direction: 'asc',
        sortable: true,
      },
      {
        id: 'vehicleModel',
        name: 'cars.vehicle_model',
        class: 'text-left col-25p',
      },
      {
        id: 'vehicleModelVersion',
        name: 'cars.vehicle_model_version',
        class: 'text-left col-40p',
        formatter: (modelVersion: string) => modelVersion ? modelVersion : '-',
      },
    ];
  }
}
