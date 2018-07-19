import {
  Component,
  OnInit,
  Input,
  Output,
  EventEmitter,
  ChangeDetectorRef,
  NgZone,
  ViewChild,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { Observable, of, iif, timer } from 'rxjs';
import { map, catchError, switchMap, tap } from 'rxjs/operators';
import { debounce } from 'lodash';

import * as QRCode from 'qrcode';

import { Payment, PayReq, PayCheck } from '../../services/donate.model';
import { DonateService } from '../../services/donate.service';
import { AuthService } from '../../services/auth.service';
import { DstoreObject } from '../../dstore-client.module/utils/dstore-objects';
import { BaseService } from '../../dstore/services/base.service';
import { DonorsComponent } from '../donors/donors.component';

@Component({
  selector: 'app-donate',
  templateUrl: './donate.component.html',
  styleUrls: ['./donate.component.scss'],
})
export class DonateComponent implements OnInit {
  constructor(
    private authService: AuthService,
    private donateService: DonateService,
    private sanitizer: DomSanitizer,
  ) {}
  @ViewChild(DonorsComponent) donors: DonorsComponent;
  @Input() appName: string;
  amount = 2;
  Payment = Payment;
  payment: Payment = Payment.WeChat;
  randAmount = [2.0, 5.2, 8.88, 6.66, 18.0, 12.0, 66.0, 25.5, 9.99, 15.2];
  loading: boolean;
  qrImg: SafeResourceUrl;
  waitPay$: Observable<PayCheck>;

  ngOnInit() {}

  init() {
    this.amount = 2;
    this.waitPay$ = null;
    this.payment = Payment.WeChat;
    this.loading = false;
    this.qrImg = null;
  }

  rand() {
    let r = this.amount;
    while (r === this.amount) {
      r = this.randAmount[Math.floor(Math.random() * this.randAmount.length)];
    }
    this.amount = r;
  }

  pay() {
    this.loading = true;
    this.authService.info$
      .pipe(
        map(info => {
          const req: PayReq = {
            appStore: BaseService.domainName,
            appName: this.appName,
            amount: this.amount * 100,
          };
          if (info) {
            req.userID = info.userID;
          }
          return req;
        }),
        switchMap(
          req => this.donateService.donate(this.payment, req),
          (req, resp) => {
            return { req, resp };
          },
        ),
      )
      .subscribe(({ req, resp }) => {
        if (resp.error) {
          console.error(resp);
          return;
        }
        if (this.payment === Payment.WeChat) {
          if (!resp.shortURL) {
            return;
          }
          QRCode.toDataURL(resp.shortURL).then(
            url => (this.qrImg = this.sanitizer.bypassSecurityTrustResourceUrl(url)),
          );
        } else {
          DstoreObject.openURL(resp.url);
        }
        this.loading = false;
        this.waitPay$ = new Observable<PayCheck>(obs => {
          const s = timer(0, 1000)
            .pipe(
              switchMap(() => this.donateService.check(this.payment, resp.tradeID)),
              tap(c => {
                obs.next(c);
                if (c.isExist) {
                  s.unsubscribe();
                  obs.complete();
                  DstoreObject.raiseWindow();
                  this.donors.add(req.userID);
                }
              }),
            )
            .subscribe();
        });
      });
  }

  inputChange(e: Event) {
    const el = e.target as HTMLInputElement;
    if (!el.value.match(/^\d{0,9}(\.\d{0,2})?$/)) {
      el.value = this.amount.toString();
    }
    if (el.value) {
      this.amount = parseFloat(el.value);
    } else {
      this.amount = null;
    }
  }
}