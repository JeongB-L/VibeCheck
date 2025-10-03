import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Outings } from './outings';

describe('Outings', () => {
  let component: Outings;
  let fixture: ComponentFixture<Outings>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Outings],
    }).compileComponents();

    fixture = TestBed.createComponent(Outings);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
