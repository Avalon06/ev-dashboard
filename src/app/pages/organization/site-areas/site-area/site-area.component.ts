import { Component, Input, OnInit } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, Validators } from '@angular/forms';
import { MatCheckboxChange } from '@angular/material/checkbox';
import { MatDialog, MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { AuthorizationService } from 'app/services/authorization.service';
import { CentralServerService } from 'app/services/central-server.service';
import { ComponentService } from 'app/services/component.service';
import { ConfigService } from 'app/services/config.service';
import { DialogService } from 'app/services/dialog.service';
import { MessageService } from 'app/services/message.service';
import { SpinnerService } from 'app/services/spinner.service';
import { SitesDialogComponent } from 'app/shared/dialogs/sites/sites-dialog.component';
import { Address } from 'app/types/Address';
import { Action, Entity } from 'app/types/Authorization';
import { RestResponse } from 'app/types/GlobalType';
import { HTTPError } from 'app/types/HTTPError';
import { RegistrationToken } from 'app/types/RegistrationToken';
import { Site } from 'app/types/Site';
import { SiteArea, SiteAreaImage } from 'app/types/SiteArea';
import { ButtonType } from 'app/types/Table';
import TenantComponents from 'app/types/TenantComponents';
import { Utils } from 'app/utils/Utils';
import * as moment from 'moment';
import { debounceTime, mergeMap } from 'rxjs/operators';

import { CentralServerNotificationService } from '../../../../services/central-server-notification.service';
import { ChargingStations } from '../../../../utils/ChargingStations';
import { RegistrationTokensTableDataSource } from '../../../settings/charging-station/registration-tokens/registration-tokens-table-data-source';

@Component({
  selector: 'app-site-area',
  templateUrl: 'site-area.component.html',
  providers: [RegistrationTokensTableDataSource],
})
export class SiteAreaComponent implements OnInit {
  @Input() public currentSiteAreaID!: string;
  @Input() public inDialog!: boolean;
  @Input() public dialogRef!: MatDialogRef<any>;

  public image: any = SiteAreaImage.NO_IMAGE;
  public maxSize: number;
  public siteArea: SiteArea;

  public formGroup!: FormGroup;
  public id!: AbstractControl;
  public name!: AbstractControl;
  public site!: AbstractControl;
  public siteID!: AbstractControl;
  public maximumPower!: AbstractControl;
  public maximumPowerInAmps!: AbstractControl;
  public accessControl!: AbstractControl;
  public smartCharging!: AbstractControl;
  public numberOfPhases!: AbstractControl;

  public phaseMap = [
    { key: 1, description: 'site_areas.single_phased' },
    { key: 3, description: 'site_areas.three_phased' },
  ];

  public address!: Address;
  public isAdmin!: boolean;
  public isSmartChargingComponentActive = false;
  public isSmartChargingActive = false;

  public registrationToken!: RegistrationToken;

  constructor(
    private authorizationService: AuthorizationService,
    private centralServerService: CentralServerService,
    private centralServerNotificationService: CentralServerNotificationService,
    private messageService: MessageService,
    private spinnerService: SpinnerService,
    private translateService: TranslateService,
    private configService: ConfigService,
    private componentService: ComponentService,
    private activatedRoute: ActivatedRoute,
    private dialog: MatDialog,
    private dialogService: DialogService,
    private router: Router) {
    this.maxSize = this.configService.getSiteArea().maxPictureKb;
    // Check auth
    if (this.activatedRoute.snapshot.params['id'] &&
      !authorizationService.canUpdateSiteArea()) {
      // Not authorized
      this.router.navigate(['/']);
    }
    // Set
    this.isAdmin = this.authorizationService.canAccess(Entity.SITE_AREA, Action.CREATE);
    this.isSmartChargingComponentActive = this.componentService.isActive(TenantComponents.SMART_CHARGING);
  }

  public ngOnInit() {
    // Init the form
    this.formGroup = new FormGroup({
      id: new FormControl(''),
      name: new FormControl('',
        Validators.compose([
          Validators.required,
        ])),
      site: new FormControl('',
        Validators.compose([
          Validators.required,
        ])),
      siteID: new FormControl('',
        Validators.compose([
          Validators.required,
        ])),
      maximumPower: new FormControl('',
        Validators.compose(
          this.isSmartChargingComponentActive ?
            [
              Validators.pattern(/^[+-]?([0-9]*[.])?[0-9]+$/),
              Validators.min(1),
              Validators.required,
            ] : [],
        )),
      maximumPowerInAmps: new FormControl(''),
      accessControl: new FormControl(true),
      smartCharging: new FormControl(false),
      numberOfPhases: new FormControl('',
        Validators.compose([
          Validators.required,
        ])),
    });
    // Form
    this.id = this.formGroup.controls['id'];
    this.name = this.formGroup.controls['name'];
    this.site = this.formGroup.controls['site'];
    this.siteID = this.formGroup.controls['siteID'];
    this.maximumPower = this.formGroup.controls['maximumPower'];
    this.maximumPowerInAmps = this.formGroup.controls['maximumPowerInAmps'];
    this.smartCharging = this.formGroup.controls['smartCharging'];
    this.accessControl = this.formGroup.controls['accessControl'];
    this.numberOfPhases = this.formGroup.controls['numberOfPhases'];
    this.maximumPower.disable();
    this.maximumPowerInAmps.disable();
    this.numberOfPhases.disable();
    if (this.currentSiteAreaID) {
      this.loadSiteArea();
      this.loadRegistrationToken();
    } else if (this.activatedRoute && this.activatedRoute.params) {
      this.activatedRoute.params.subscribe((params: Params) => {
        this.currentSiteAreaID = params['id'];
      });
    }
    // listen to escape key
    this.dialogRef.keydownEvents().subscribe((keydownEvents) => {
      // check if escape
      if (keydownEvents && keydownEvents.code === 'Escape') {
        this.onClose();
      }
    });
    this.centralServerNotificationService.getSubjectSiteArea().pipe(
      debounceTime(this.configService.getAdvanced().debounceTimeNotifMillis)).subscribe((singleChangeNotification) => {
        // Update user?
        if (singleChangeNotification && singleChangeNotification.data && singleChangeNotification.data.id === this.currentSiteAreaID) {
          this.loadSiteArea();
        }
      });
  }

  public isOpenInDialog(): boolean {
    return this.inDialog;
  }

  public assignSite() {
    // Create the dialog
    const dialogConfig = new MatDialogConfig();
    dialogConfig.panelClass = 'transparent-dialog-container';
    dialogConfig.data = {
      title: 'site_areas.assign_site',
      validateButtonTitle: 'general.select',
      sitesAdminOnly: true,
      rowMultipleSelection: false,
    };
    // Open
    this.dialog.open(SitesDialogComponent, dialogConfig).afterClosed().subscribe((result) => {
      if (result && result.length > 0 && result[0] && result[0].objectRef) {
        const site: Site = (result[0].objectRef) as Site;
        this.site.setValue(site.name);
        this.siteID.setValue(site.id);
        this.formGroup.markAsDirty();
      }
    });
  }

  public smartChargingChanged(event: MatCheckboxChange) {
    if (event.checked) {
      this.maximumPower.enable();
      this.numberOfPhases.enable();
      this.dialogService.createAndShowYesNoDialog(
        this.translateService.instant('chargers.smart_charging.enable_smart_charging_for_site_area_title'),
        this.translateService.instant('chargers.smart_charging.enable_smart_charging_for_site_area_body'),
      ).subscribe((result) => {
        if (result === ButtonType.NO) {
          this.smartCharging.setValue(false);
          this.maximumPower.disable();
          this.numberOfPhases.disable();
        }
      });
    } else {
      this.maximumPower.disable();
      this.numberOfPhases.disable();
    }
    if (!event.checked && this.isSmartChargingActive) {
      this.dialogService.createAndShowYesNoDialog(
        this.translateService.instant('chargers.smart_charging.disable_smart_charging_for_site_area_title'),
        this.translateService.instant('chargers.smart_charging.disable_smart_charging_for_site_area_body'),
      ).subscribe((result) => {
        if (result === ButtonType.NO) {
          this.smartCharging.setValue(true);
          this.maximumPower.enable();
          this.numberOfPhases.enable();
        }
      });
    }
  }

  public setCurrentSiteAreaId(currentSiteAreaId: string) {
    this.currentSiteAreaID = currentSiteAreaId;
  }

  public refresh() {
    this.loadSiteArea();
  }

  public loadSiteArea() {
    if (!this.currentSiteAreaID) {
      return;
    }
    // Show spinner
    this.spinnerService.show();
    this.centralServerService.getSiteArea(this.currentSiteAreaID, true).pipe(mergeMap((siteArea) => {
      this.spinnerService.hide();
      this.siteArea = siteArea;
      this.isAdmin = this.authorizationService.isAdmin() ||
        this.authorizationService.isSiteAdmin(siteArea.siteID);
      // if not admin switch in readonly mode
      if (!this.isAdmin) {
        this.formGroup.disable();
      }
      // Init form
      if (siteArea.id) {
        this.formGroup.controls.id.setValue(siteArea.id);
      }
      if (siteArea.name) {
        this.formGroup.controls.name.setValue(siteArea.name);
      }
      if (siteArea.siteID) {
        this.formGroup.controls.siteID.setValue(siteArea.siteID);
      }
      if (siteArea.site) {
        this.site.setValue(siteArea.site.name);
      }
      if (siteArea.maximumPower) {
        this.formGroup.controls.maximumPower.setValue(siteArea.maximumPower / 1000);
        this.maximumPowerChanged();
      }
      if (siteArea.numberOfPhases) {
        this.formGroup.controls.numberOfPhases.setValue(siteArea.numberOfPhases);
      }
      if (siteArea.smartCharging) {
        this.formGroup.controls.smartCharging.setValue(siteArea.smartCharging);
        this.isSmartChargingActive = siteArea.smartCharging;
        this.maximumPower.enable();
        this.numberOfPhases.enable();
      } else {
        this.formGroup.controls.smartCharging.setValue(false);
        this.maximumPower.disable();
        this.numberOfPhases.disable();
      }
      if (siteArea.accessControl) {
        this.formGroup.controls.accessControl.setValue(siteArea.accessControl);
      } else {
        this.formGroup.controls.accessControl.setValue(false);
      }
      if (siteArea.address) {
        this.address = siteArea.address;
      }
      // Force
      this.formGroup.updateValueAndValidity();
      this.formGroup.markAsPristine();
      this.formGroup.markAllAsTouched();
      // Yes, get image
      return this.centralServerService.getSiteAreaImage(this.currentSiteAreaID);
    })).subscribe((siteAreaImage) => {
      if (siteAreaImage && siteAreaImage.image) {
        this.image = siteAreaImage.image.toString();
      }
    }, (error) => {
      this.spinnerService.hide();
      switch (error.status) {
        case HTTPError.OBJECT_DOES_NOT_EXIST_ERROR:
          this.messageService.showErrorMessage('site_areas.site_invalid');
          break;
        default:
          Utils.handleHttpError(error, this.router, this.messageService,
            this.centralServerService, 'general.unexpected_error_backend');
      }
    });
  }

  public updateSiteAreaImage(siteArea: SiteArea) {
    // Set the image
    if (!this.image.endsWith(SiteAreaImage.NO_IMAGE)) {
      siteArea.image = this.image;
    } else {
      // No image
      delete siteArea.image;
    }
  }

  public updateSiteAreaCoordinates(siteArea: SiteArea) {
    if (siteArea.address && siteArea.address.coordinates &&
      !(siteArea.address.coordinates[0] || siteArea.address.coordinates[1])) {
      delete siteArea.address.coordinates;
    }
  }

  public saveSiteArea(siteArea: SiteArea) {
    siteArea.maximumPower = siteArea.maximumPower * 1000;
    if (this.currentSiteAreaID) {
      this.updateSiteArea(siteArea);
    } else {
      this.createSiteArea(siteArea);
    }
  }

  public generateRegistrationToken() {
    if (this.currentSiteAreaID) {
      this.dialogService.createAndShowYesNoDialog(
        this.translateService.instant('settings.charging_station.registration_token_creation_title'),
        this.translateService.instant('settings.charging_station.registration_token_creation_confirm'),
      ).subscribe((result) => {
        if (result === ButtonType.YES) {
          this.spinnerService.show();
          this.centralServerService.createRegistrationToken({
            siteAreaID: this.currentSiteAreaID,
            description: this.translateService.instant(
              'settings.charging_station.registration_token_site_area_name', { siteAreaName: this.siteArea.name }),
          }).subscribe((token) => {
            this.spinnerService.hide();
            if (token) {
              this.registrationToken = token;
              this.messageService.showSuccessMessage('settings.charging_station.registration_token_creation_success');
            } else {
              Utils.handleError(null,
                this.messageService, 'settings.charging_station.registration_token_creation_error');
            }
          }, (error) => {
            this.spinnerService.hide();
            Utils.handleHttpError(error, this.router, this.messageService, this.centralServerService,
              'settings.charging_station.registration_token_creation_error');
          });
        }
      });
    }
  }

  public copyUrl(url: string) {
    Utils.copyToClipboard(url);
    this.messageService.showInfoMessage('settings.charging_station.url_copied');
  }

  public imageChanged(event: any) {
    // load picture
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.size > (this.maxSize * 1024)) {
        this.messageService.showErrorMessage('site_areas.image_size_error', { maxPictureKb: this.maxSize });
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          this.image = reader.result as string;
          this.formGroup.markAsDirty();
        };
        reader.readAsDataURL(file);
      }
    }
  }

  public clearImage() {
    // Clear
    this.image = SiteAreaImage.NO_IMAGE;
    // Set form dirty
    this.formGroup.markAsDirty();
  }

  public closeDialog(saved: boolean = false) {
    if (this.inDialog) {
      this.dialogRef.close(saved);
    }
  }

  public onClose() {
    if (this.formGroup.invalid && this.formGroup.dirty) {
      this.dialogService.createAndShowInvalidChangeCloseDialog(
        this.translateService.instant('general.change_invalid_pending_title'),
        this.translateService.instant('general.change_invalid_pending_text'),
      ).subscribe((result) => {
        if (result === ButtonType.DO_NOT_SAVE_AND_CLOSE) {
          this.closeDialog();
        }
      });
    } else if (this.formGroup.dirty) {
      this.dialogService.createAndShowDirtyChangeCloseDialog(
        this.translateService.instant('general.change_pending_title'),
        this.translateService.instant('general.change_pending_text'),
      ).subscribe((result) => {
        if (result === ButtonType.SAVE_AND_CLOSE) {
          this.saveSiteArea(this.formGroup.value);
        } else if (result === ButtonType.DO_NOT_SAVE_AND_CLOSE) {
          this.closeDialog();
        }
      });
    } else {
      this.closeDialog();
    }
  }

  public maximumPowerChanged() {
    if (!this.maximumPower.errors) {
      this.maximumPowerInAmps.setValue(ChargingStations.convertWattToAmp(1, this.maximumPower.value as number * 1000));
    }
  }

  private loadRegistrationToken() {
    if (!this.currentSiteAreaID) {
      return;
    }
    this.centralServerService.getRegistrationTokens({
      siteAreaID: this.currentSiteAreaID,
    }).subscribe(((dataResult) => {
      if (dataResult && dataResult.result) {
        for (const registrationToken of dataResult.result) {
          if (this.isRegistrationTokenValid(registrationToken)) {
            this.registrationToken = registrationToken;
            break;
          }
        }
      }
    }));
  }

  private isRegistrationTokenValid(registrationToken: RegistrationToken): boolean {
    const now = moment();
    return registrationToken.expirationDate && now.isBefore(registrationToken.expirationDate)
      && (!registrationToken.revocationDate || now.isBefore(registrationToken.revocationDate));
  }

  private createSiteArea(siteArea: SiteArea) {
    this.spinnerService.show();
    // Set the image
    this.updateSiteAreaImage(siteArea);
    // Set coordinates
    this.updateSiteAreaCoordinates(siteArea);
    // Create
    this.centralServerService.createSiteArea(siteArea).subscribe((response) => {
      this.spinnerService.hide();
      if (response.status === RestResponse.SUCCESS) {
        this.messageService.showSuccessMessage('site_areas.create_success',
          { siteAreaName: siteArea.name });
        this.currentSiteAreaID = siteArea.id;
        this.closeDialog(true);
      } else {
        Utils.handleError(JSON.stringify(response),
          this.messageService, 'site_areas.create_error');
      }
    }, (error) => {
      this.spinnerService.hide();
      switch (error.status) {
        case HTTPError.OBJECT_DOES_NOT_EXIST_ERROR:
          this.messageService.showErrorMessage('site_areas.site_area_do_not_exist');
          break;
        default:
          Utils.handleHttpError(error, this.router, this.messageService,
            this.centralServerService, 'site_areas.create_error');
      }
    });
  }

  private updateSiteArea(siteArea: SiteArea) {
    this.spinnerService.show();
    // Set the image
    this.updateSiteAreaImage(siteArea);
    // Set coordinates
    this.updateSiteAreaCoordinates(siteArea);
    // Update
    this.centralServerService.updateSiteArea(siteArea).subscribe((response) => {
      this.spinnerService.hide();
      if (response.status === RestResponse.SUCCESS) {
        this.messageService.showSuccessMessage('site_areas.update_success', { siteAreaName: siteArea.name });
        this.closeDialog(true);
      } else {
        Utils.handleError(JSON.stringify(response),
          this.messageService, 'site_areas.update_error');
      }
    }, (error) => {
      this.spinnerService.hide();
      switch (error.status) {
        case HTTPError.THREE_PHASE_CHARGER_ON_SINGLE_PHASE_SITE_AREA:
          this.messageService.showErrorMessage('site_areas.update_phase_error');
          break;
        case HTTPError.CLEAR_CHARGING_PROFILE_NOT_SUCCESSFUL:
          this.dialogService.createAndShowOkDialog(
            this.translateService.instant('chargers.smart_charging.clearing_charging_profiles_not_successful_title'),
            this.translateService.instant('chargers.smart_charging.clearing_charging_profiles_not_successful_body',
              { siteAreaName: siteArea.name }));
          this.closeDialog(true);
          break;
        case HTTPError.OBJECT_DOES_NOT_EXIST_ERROR:
          this.messageService.showErrorMessage('site_areas.site_areas_do_not_exist');
          break;
        default:
          Utils.handleHttpError(error, this.router, this.messageService,
            this.centralServerService, 'site_areas.update_error');
      }
    });
  }
}
