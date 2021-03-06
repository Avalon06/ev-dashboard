import { Injectable } from '@angular/core';
import { Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { SpinnerService } from 'app/services/spinner.service';
import { AppDatePipe } from 'app/shared/formatters/app-date.pipe';
import { Schedule } from 'app/types/ChargingProfile';
import { ChargingStation, ChargingStationPowers } from 'app/types/ChargingStation';
import { DropdownItem, TableActionDef, TableColumnDef, TableDef, TableEditType } from 'app/types/Table';
import { Utils } from 'app/utils/Utils';

import { EditableTableDataSource } from '../../../../shared/table/editable-table-data-source';
import { ChargingStationsChargingProfilePowerSliderCellComponent } from '../cell-components/charging-stations-charging-profile-power-slider-cell';

@Injectable()
export class ChargingStationChargingProfileLimitScheduleEditableTableDataSource extends EditableTableDataSource<Schedule> {
  public startDate!: Date;
  public endDate!: Date;
  public charger!: ChargingStation;
  private chargerPowers!: ChargingStationPowers;

  constructor(
    public spinnerService: SpinnerService,
    public translateService: TranslateService,
    private datePipe: AppDatePipe,
  ) {
    super(spinnerService, translateService);
  }

  public buildTableDef(): TableDef {
    return {
      id: 'ChargingStationChargingProfileLimitScheduleEditableTableDataSource',
      isEditable: true,
      errorMessage: 'chargers.smart_charging.empty_schedule_list_error',
    };
  }

  public buildTableColumnDefs(): TableColumnDef[] {
    const tableColumnDef: TableColumnDef[] = [
      {
        id: 'startDate',
        name: 'chargers.smart_charging.start_date',
        editType: TableEditType.DISPLAY_ONLY,
        headerClass: 'col-20p',
        class: 'text-center col-20p',
        formatter: (value: Date) => this.datePipe.transform(value, 'short'),
      },
      {
        id: 'duration',
        name: 'chargers.smart_charging.duration_with_unit',
        headerClass: 'col-20p',
        editType: TableEditType.INPUT,
        validators: [
          Validators.required,
          Validators.min(1),
          Validators.max(1440),
          Validators.pattern(/^(0|[1-9]\d*$)/),
        ],
        errors: [
          { id: 'min', message: 'chargers.smart_charging.invalid_min_duration', messageParams: { minDuration: 1 } },
          { id: 'max', message: 'chargers.smart_charging.invalid_max_duration', messageParams: { maxDuration: 1440 } },
          { id: 'pattern', message: 'general.error_number_pattern' },
          { id: 'required', message: 'general.mandatory_field' },
        ],
        class: 'col-20p',
      },
      {
        id: 'endDate',
        name: 'chargers.smart_charging.end_date',
        editType: TableEditType.DISPLAY_ONLY,
        headerClass: 'col-20p',
        class: 'text-center col-20p',
        formatter: (value: Date) => this.datePipe.transform(value, 'short'),
      },
      {
        id: 'limit',
        name: 'chargers.smart_charging.limit_title',
        isAngularComponent: true,
        angularComponent: ChargingStationsChargingProfilePowerSliderCellComponent,
        headerClass: 'col-40p',
        class: 'col-40p',
      },
    ];
    return tableColumnDef;
  }

  public setCharger(charger: ChargingStation) {
    this.charger = charger;
    this.tableColumnDefs[3].additionalParameters = { charger };
    this.chargerPowers = Utils.getChargingStationPowers(this.charger, undefined, true);
  }

  public refreshChargingSchedules() {
    const chargingSchedules = this.getContent();
    this.endDate = new Date(this.startDate);
    if (chargingSchedules.length > 0) {
      chargingSchedules[0].startDate = new Date(this.startDate);
      // Recompute charging plan date
      for (let i = 0; i < chargingSchedules.length; i++) {
        // Update the date of the next records
        if (i < chargingSchedules.length - 1) {
          chargingSchedules[i + 1].startDate = new Date(
            chargingSchedules[i].startDate.getTime() + chargingSchedules[i].duration * 60 * 1000);
        }
        // Update the limit in kW
        chargingSchedules[i].limitInkW = Math.floor(Utils.convertAmpToPowerWatts(this.charger, chargingSchedules[i].limit) / 1000);
        chargingSchedules[i].endDate =
          new Date(chargingSchedules[i].startDate.getTime() + chargingSchedules[i].duration * 60 * 1000);
        // Add
        this.endDate.setTime(this.endDate.getTime() + chargingSchedules[i].duration * 60 * 1000);
      }
    }
  }

  public createRow() {
    const chargingSchedulePeriod = {
      startDate: this.startDate,
      duration: 60,
      limitInkW: Math.floor(Utils.convertAmpToPowerWatts(this.charger, this.chargerPowers.maxAmp) / 1000),
      limit: this.chargerPowers.maxAmp,
      key: '',
      id: 0,
    } as Schedule;
    // Fix the start date
    const chargingSchedules = this.getContent();
    if (chargingSchedules.length > 0) {
      chargingSchedulePeriod.startDate =
        new Date(chargingSchedules[chargingSchedules.length - 1].startDate.getTime() + chargingSchedulePeriod.duration * 60 * 1000);
      chargingSchedulePeriod.endDate =
        new Date(chargingSchedulePeriod.startDate.getTime() + chargingSchedulePeriod.duration * 60 * 1000);
    }
    return chargingSchedulePeriod;
  }

  public rowActionTriggered(actionDef: TableActionDef, schedule: Schedule, dropdownItem?: DropdownItem) {
    // Call parent
    super.rowActionTriggered(actionDef, schedule, dropdownItem, this.refreshChargingSchedules.bind(this));
  }

  public rowCellUpdated(cellValue: number, cellIndex: number, columnDef: TableColumnDef) {
    // Call parent
    super.rowCellUpdated(cellValue, cellIndex, columnDef, this.refreshChargingSchedules.bind(this));
  }
}
