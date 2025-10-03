import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OutingDetail } from './outing-detail';

describe('OutingDetail', () => {
  let component: OutingDetail;
  let fixture: ComponentFixture<OutingDetail>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OutingDetail]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OutingDetail);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
