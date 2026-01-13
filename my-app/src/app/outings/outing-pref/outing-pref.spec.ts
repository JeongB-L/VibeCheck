import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OutingPref } from './outing-pref';

describe('OutingPref', () => {
  let component: OutingPref;
  let fixture: ComponentFixture<OutingPref>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OutingPref]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OutingPref);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
